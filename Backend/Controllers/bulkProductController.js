import { parse } from "csv-parse/sync";
import AdmZip from "adm-zip";
import { Product } from "../Models/Product.js";
import { Category } from "../Models/Category.js";
import { Subcategory } from "../Models/Subcategory.js";
import BulkUploadJob from "../Models/BulkUploadJob.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { runAfterResponse } from "../utils/afterResponse.js";
import { createError } from "../utils/commonFunctions.js";
import slugify from "slugify";
import sharp from "sharp";

// Standard sizes for variant pricing/stock columns in the template.
// These match the most common size set used across the codebase.
const VARIANT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

// ====================================================
// Helper: SSRF guard for admin-supplied image URLs (BUG-2).
// Adapted from printLayoutController's isUnsafeImageUrl — rejects non-https
// and private/loopback/link-local/metadata hosts so the server never
// fetches internal network resources.
// ====================================================
function isUnsafeImageUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return true;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return true;
    }
    if (
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)
    ) {
      return true;
    }
    if (host.startsWith("[::") || host === "::1" || host === "::") return true;
    return false;
  } catch {
    return true;
  }
}

// ====================================================
// Helper: Parse variantPrice_* and variantStock_* columns
// into variantPricing / variantStock objects.
// Returns { variantPricing, variantStock, hasVariants }.
// ====================================================
function parseVariantColumns(row) {
  const variantPricing = {};
  const variantStock = {};
  let hasVariants = false;

  for (const size of VARIANT_SIZES) {
    const priceVal = row[`variantPrice_${size}`];
    const stockVal = row[`variantStock_${size}`];

    if (priceVal !== undefined && priceVal !== "" && priceVal !== null) {
      const parsed = parseFloat(priceVal);
      if (!isNaN(parsed) && parsed >= 0) {
        variantPricing[size] = parsed;
        hasVariants = true;
      }
    }

    if (stockVal !== undefined && stockVal !== "" && stockVal !== null) {
      const parsed = parseInt(stockVal, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        variantStock[size] = parsed;
        hasVariants = true;
      }
    }
  }

  return { variantPricing, variantStock, hasVariants };
}

// ====================================================
// Helper: Download an image from URL and validate it
// Returns { buffer, warnings } or null on failure
// ====================================================
async function downloadAndValidateImage(url, rowNum, imageUrlIndex) {
  const timeoutMs = 15000; // 15 seconds per URL
  try {
    // SSRF guard: never fetch private/loopback/metadata/non-https targets
    if (isUnsafeImageUrl(url)) {
      return {
        buffer: null,
        warning: `Image URL #${imageUrlIndex + 1} blocked (private, loopback, or non-https URL not allowed)`,
      };
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url.trim(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "BulkUpload-ImageFetcher/1.0",
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return {
        buffer: null,
        warning: `Image URL #${imageUrlIndex + 1} failed: HTTP ${response.status} for ${url}`,
      };
    }
    
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return {
        buffer: null,
        warning: `Image URL #${imageUrlIndex + 1} is not an image: ${contentType} for ${url}`,
      };
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Validate actual image bytes via sharp
    await sharp(buffer).metadata();
    
    return { buffer, warning: null };
  } catch (err) {
    const reason = err.name === "AbortError" ? "timeout" : err.message;
    return {
      buffer: null,
      warning: `Image URL #${imageUrlIndex + 1} failed: ${reason} for ${url}`,
    };
  }
}

// ====================================================
// STEP A: Download a CSV/Excel template for the admin
// ====================================================
export const downloadTemplate = async (req, res, next) => {
  try {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Products");

    // Base columns + optional variant columns + imageUrls
    const columns = [
      { header: "name", key: "name", width: 30 },
      { header: "description", key: "description", width: 50 },
      { header: "price", key: "price", width: 12 },
      { header: "stock", key: "stock", width: 10 },
      { header: "categoryName", key: "categoryName", width: 20 },
      { header: "subcategoryName", key: "subcategoryName", width: 20 },
      { header: "brand", key: "brand", width: 15 },
      { header: "colors", key: "colors", width: 20 },
      { header: "sizes", key: "sizes", width: 15 },
      { header: "tags", key: "tags", width: 25 },
      { header: "imageFileNames", key: "imageFileNames", width: 40 },
      { header: "freeShipping", key: "freeShipping", width: 12 },
      { header: "shippingCharge", key: "shippingCharge", width: 15 },
      { header: "customizable", key: "customizable", width: 12 },
    ];

    // Add variant pricing/stock columns for standard sizes
    for (const size of VARIANT_SIZES) {
      columns.push({
        header: `variantPrice_${size}`,
        key: `variantPrice_${size}`,
        width: 14,
      });
    }
    for (const size of VARIANT_SIZES) {
      columns.push({
        header: `variantStock_${size}`,
        key: `variantStock_${size}`,
        width: 14,
      });
    }

    // Add imageUrls column at the end
    columns.push({
      header: "imageUrls",
      key: "imageUrls",
      width: 80,
    });

    sheet.columns = columns;

    // Example row: flat-price product (no variant columns filled)
    const exampleRow = {
      name: "Example T-Shirt",
      description: "A comfortable cotton t-shirt",
      price: 1500,
      stock: 50,
      categoryName: "Apparel",
      subcategoryName: "T-Shirts",
      brand: "Irhas Inn",
      colors: "Red,Blue,Black",
      sizes: "S,M,L,XL",
      tags: "cotton,casual,summer",
      imageFileNames: "shirt1.jpg,shirt2.jpg",
      freeShipping: "true",
      shippingCharge: 0,
      customizable: "false",
      imageUrls: "https://example.com/image1.jpg,https://example.com/image2.jpg",
    };
    // Leave all variantPrice_*/variantStock_* blank for this example row
    sheet.addRow(exampleRow);

    // Second example row: size-wise priced product
    const variantExampleRow = {
      name: "Example Size-Priced Hoodie",
      description: "Hoodie with size-based pricing",
      price: 0,
      stock: 0,
      categoryName: "Apparel",
      subcategoryName: "Hoodies",
      brand: "Irhas Inn",
      colors: "Black",
      sizes: "S,M,L,XL",
      tags: "hoodie,winter",
      imageFileNames: "hoodie1.jpg",
      freeShipping: "false",
      shippingCharge: 0,
      customizable: "false",
      variantPrice_S: 2500,
      variantPrice_M: 2800,
      variantPrice_L: 3000,
      variantPrice_XL: 3200,
      variantStock_S: 20,
      variantStock_M: 30,
      variantStock_L: 25,
      variantStock_XL: 15,
      imageUrls: "https://example.com/hoodie.jpg",
    };
    sheet.addRow(variantExampleRow);

    // Add an instructions row below the examples
    const instructionRowNum = 4; // after header (1) + 2 example rows (2,3)
    const instructionsSheet = workbook.addWorksheet("Instructions");
    instructionsSheet.columns = [
      { header: "Column", width: 25 },
      { header: "Description", width: 60 },
      { header: "Required", width: 12 },
      { header: "Example", width: 30 },
    ];
    instructionsSheet.addRow({
      Column: "name",
      Description: "Product name",
      Required: "Yes",
      Example: "Black Graphic T-Shirt",
    });
    instructionsSheet.addRow({
      Column: "description",
      Description: "Product description",
      Required: "No",
      Example: "A comfortable cotton t-shirt",
    });
    instructionsSheet.addRow({
      Column: "price",
      Description:
        "Base price (required for flat-priced products; can be 0 for size-priced products)",
      Required: "Conditional",
      Example: "1500",
    });
    instructionsSheet.addRow({
      Column: "stock",
      Description:
        "Total stock (auto-calculated from variantStock if variant columns are used)",
      Required: "No",
      Example: "50",
    });
    instructionsSheet.addRow({
      Column: "categoryName",
      Description: "Category name (must match an existing category exactly, case-insensitive)",
      Required: "Yes",
      Example: "Apparel",
    });
    instructionsSheet.addRow({
      Column: "subcategoryName",
      Description: "Subcategory name (must exist under the selected category)",
      Required: "No",
      Example: "T-Shirts",
    });
    instructionsSheet.addRow({
      Column: "colors",
      Description: "Comma-separated color options",
      Required: "No",
      Example: "Red,Blue,Black",
    });
    instructionsSheet.addRow({
      Column: "sizes",
      Description: "Comma-separated size options",
      Required: "No",
      Example: "S,M,L,XL",
    });
    instructionsSheet.addRow({
      Column: "variantPrice_XS to variantPrice_XXL",
      Description:
        "Optional per-size price. If ANY variantPrice column has a value, the product becomes size-priced. Leave blank for flat pricing.",
      Required: "Optional",
      Example: "2500",
    });
    instructionsSheet.addRow({
      Column: "variantStock_XS to variantStock_XXL",
      Description:
        "Optional per-size stock. When variant columns are used, the main 'stock' field is auto-calculated as the sum.",
      Required: "Optional",
      Example: "20",
    });
    instructionsSheet.addRow({
      Column: "imageFileNames",
      Description: "Comma-separated filenames matching files in the ZIP (use this OR imageUrls, not both)",
      Required: "Conditional",
      Example: "shirt1.jpg,shirt2.jpg",
    });
    instructionsSheet.addRow({
      Column: "imageUrls",
      Description:
        "Optional — comma-separated direct image URLs (e.g. https://example.com/image.jpg). Use this INSTEAD of imageFileNames + ZIP if you don't have local image files. If both imageUrls and imageFileNames are filled for the same row, imageUrls takes priority and the ZIP lookup is skipped for that row.",
      Required: "Optional",
      Example: "https://example.com/img1.jpg,https://example.com/img2.jpg",
    });
    instructionsSheet.addRow({
      Column: "Duplicate handling",
      Description:
        "If a product with the same name and category already exists, it will be UPDATED instead of creating a duplicate.",
      Required: "—",
      Example: "—",
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=bulk-product-template.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};

// ====================================================
// STEP B: Process bulk upload (Excel/CSV + ZIP of images)
// ====================================================
export const bulkUploadProducts = async (req, res, next) => {
  try {
    if (!req.files || !req.files.dataFile || !req.files.dataFile[0]) {
      return res.status(400).json({
        success: false,
        message: "Product data file (CSV/Excel) is required",
      });
    }

    const dataFile = req.files.dataFile[0];
    const imagesZip = req.files.imagesZip ? req.files.imagesZip[0] : null;

    // Parse image ZIP into a map: filename -> buffer
    const imageMap = {};
    if (imagesZip) {
      const zip = new AdmZip(imagesZip.buffer);
      const zipEntries = zip.getEntries();

      // ZIP-bomb guards (BUG-13): cap entry count and total uncompressed
      // size BEFORE extracting anything into memory.
      const MAX_ZIP_ENTRIES = 2000;
      const MAX_ZIP_UNCOMPRESSED_BYTES = 300 * 1024 * 1024; // 300MB
      const fileEntries = zipEntries.filter((e) => !e.isDirectory);
      if (fileEntries.length > MAX_ZIP_ENTRIES) {
        return res.status(400).json({
          success: false,
          message: `Images ZIP contains too many files (max ${MAX_ZIP_ENTRIES}).`,
        });
      }
      const totalUncompressed = fileEntries.reduce(
        (sum, e) => sum + (Number(e.header?.size) || 0),
        0
      );
      if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
        return res.status(400).json({
          success: false,
          message: "Images ZIP uncompressed content is too large (max 300MB).",
        });
      }

      zipEntries.forEach((entry) => {
        if (!entry.isDirectory) {
          const fileName = entry.entryName.split("/").pop();
          imageMap[fileName] = entry.getData();
        }
      });
    }

    // Parse data file (CSV or Excel)
    let rows = [];
    const isCsv = dataFile.originalname.toLowerCase().endsWith(".csv");

    if (isCsv) {
      // Strip UTF-8 BOM so the first header isn't "\uFEFFname" (BUG-4)
      const csvText = dataFile.buffer.toString("utf-8").replace(/^\uFEFF/, "");
      rows = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } else {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(dataFile.buffer);
      const sheet = workbook.worksheets[0];
      const headers = [];
      sheet.getRow(1).eachCell((cell, colNum) => {
        headers[colNum] = cell.value?.toString().trim();
      });
      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // skip header
        const rowData = {};
        row.eachCell((cell, colNum) => {
          if (headers[colNum]) {
            rowData[headers[colNum]] = cell.value?.toString().trim() || "";
          }
        });
        if (Object.keys(rowData).length > 0) rows.push(rowData);
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No product rows found in the file",
      });
    }

    if (rows.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Maximum 500 products per upload. Split into batches.",
      });
    }

    // Create job record
    const job = await BulkUploadJob.create({
      uploadedBy: req.user.id,
      status: "processing",
      totalRows: rows.length,
    });

    // Respond immediately with job ID; process in background
    res.status(202).json({
      success: true,
      message: `Processing ${rows.length} products in the background`,
      jobId: job._id,
    });

    // ── BACKGROUND PROCESSING (registered with the serverless lifecycle via
    // runAfterResponse/waitUntil, so Vercel keeps the invocation alive until
    // every batch finishes and the final job status is written) ──
    runAfterResponse(
      () => processRowsInBackground(rows, imageMap, job._id, req.user.id),
      "bulkUpload"
    );
  } catch (err) {
    next(err);
  }
};

// Background processor — runs after response, doesn't block request
async function processRowsInBackground(rows, imageMap, jobId, userId) {
  const errors = [];
  // Non-fatal per-row issues (e.g. one image URL failed but the product was
  // still processed). Kept separate from `errors` (BUG-7) so failedCount
  // stays accurate.
  const warnings = [];
  const createdIds = [];
  const updatedIds = [];
  let successCount = 0;
  let updatedCount = 0;

  // Pre-fetch all categories/subcategories once (avoid N+1 queries)
  const categories = await Category.find().lean();
  const subcategories = await Subcategory.find().lean();
  const catMap = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const subcatMap = new Map(
    subcategories.map((s) => [s.name.toLowerCase(), s])
  );

  // Process in batches of 5 (parallel within batch, sequential across batches)
  const BATCH_SIZE = 5;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (row, idx) => {
        const rowNum = i + idx + 2; // +2 for header row + 1-index
        // Cloudinary public_ids uploaded during THIS row — cleaned up in the
        // catch block if the row ultimately fails (BUG-9 orphan prevention).
        const uploadedPublicIds = [];
        try {
          // Validate required fields
          if (!row.name || !row.categoryName) {
            throw new Error(
              "Missing required field: name and categoryName (both are required)"
            );
          }

          // Price is required only for flat-priced products (no variant columns)
          const { variantPricing, variantStock, hasVariants } =
            parseVariantColumns(row);

          if (!hasVariants && (!row.price || parseFloat(row.price) <= 0)) {
            throw new Error(
              "Valid price is required (or provide variantPrice_* columns for size-based pricing)"
            );
          }

          const category = catMap.get(row.categoryName.toLowerCase().trim());
          if (!category) {
            throw new Error(`Category "${row.categoryName}" not found`);
          }

          let subcategory = null;
          if (row.subcategoryName) {
            subcategory = subcatMap.get(row.subcategoryName.toLowerCase().trim());
            if (!subcategory) {
              throw new Error(
                `Subcategory "${row.subcategoryName}" not found`
              );
            }
            // BUG-6: the subcategory must belong to the row's category — a
            // same-named subcategory under a different parent must not leak in.
            if (
              subcategory.parentCategory?.toString() !== category._id.toString()
            ) {
              throw new Error(
                `Subcategory "${row.subcategoryName}" does not belong to category "${row.categoryName}"`
              );
            }
          }

          // Parse arrays
          const colors = (row.colors || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const sizes = (row.sizes || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          // ── IMAGE UPLOAD LOGIC ──
          // Priority: imageUrls (direct URLs) > imageFileNames (ZIP)
          const imageUrlList = (row.imageUrls || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          
          const imageFileNames = (row.imageFileNames || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          const uploadedImages = [];
          const imageWarnings = [];

          if (imageUrlList.length > 0) {
            // ── PATH A: Fetch images from URLs ──
            const downloadPromises = imageUrlList.map((url, idx) =>
              downloadAndValidateImage(url, rowNum, idx)
            );
            const results = await Promise.all(downloadPromises);
            
            for (let j = 0; j < results.length; j++) {
              const { buffer, warning } = results[j];
              if (buffer) {
                const cloudResult = await uploadToCloudinary(buffer, "irhasinn/products");
                uploadedImages.push({
                  url: cloudResult.secure_url,
                  public_id: cloudResult.public_id,
                  alt: row.name,
                });
                uploadedPublicIds.push(cloudResult.public_id);
              } else {
                imageWarnings.push(warning);
              }
            }
            
            // Record image warnings separately from errors (BUG-7): the
            // row still succeeded, so these must not inflate failedCount.
            for (const warning of imageWarnings) {
              warnings.push({
                row: rowNum,
                productName: row.name || "(unknown)",
                reason: warning,
              });
            }
          } else if (imageFileNames.length > 0) {
            // ── PATH B: Extract images from ZIP (existing behavior) ──
            for (const fileName of imageFileNames) {
              const buffer = imageMap[fileName];
              if (!buffer) {
                throw new Error(`Image "${fileName}" not found in ZIP`);
              }

              // Validate real image bytes via sharp
              await sharp(buffer).metadata();

              const result = await uploadToCloudinary(buffer, "irhasinn/products");
              uploadedImages.push({
                url: result.secure_url,
                public_id: result.public_id,
                alt: row.name,
              });
              uploadedPublicIds.push(result.public_id);
            }
          }

          // Require at least one image (from either source)
          if (uploadedImages.length === 0) {
            throw new Error("At least one valid image is required (provide imageUrls or imageFileNames + ZIP)");
          }

          // Derive stock: sum of variantStock if present, else flat stock
          const derivedStock = hasVariants
            ? Object.values(variantStock).reduce((s, v) => s + (Number(v) || 0), 0)
            : parseInt(row.stock) || 0;

          // BUG-3 guard: did this row actually provide any stock data?
          // (variantStock_* columns filled, or a non-blank flat stock cell)
          const rowHasStockData =
            Object.keys(variantStock).length > 0 ||
            (!hasVariants &&
              row.stock !== undefined &&
              String(row.stock).trim() !== "");

          // Derive price: 0 if variant-priced, else flat price
          const derivedPrice = hasVariants ? 0 : parseFloat(row.price) || 0;

          // Tags
          const tags = [
            ...(row.tags || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            "karachi",
            "pakistan",
            "onlineshopping",
            "viral",
            "irhasinn",
          ];

          // ── Duplicate detection: check name + category ──
          const escapedName = row.name
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const existingProduct = await Product.findOne({
            name: { $regex: `^${escapedName}$`, $options: "i" },
            category: category._id,
          });

          if (existingProduct) {
            // ── UPDATE existing product ──
            existingProduct.name = row.name.trim();
            if (row.description) existingProduct.description = row.description.trim();
            if (row.brand) existingProduct.brand = row.brand.trim();
            existingProduct.price = derivedPrice;
            existingProduct.colors = colors;
            existingProduct.sizes = sizes;
            existingProduct.variantPricing = variantPricing;
            // BUG-3 guard: only overwrite inventory when the row actually
            // provided stock data — a partial sheet must never zero out an
            // existing product's stock/variantStock.
            if (rowHasStockData) {
              existingProduct.variantStock = variantStock;
              existingProduct.stock = derivedStock;
            }
            existingProduct.freeShipping =
              row.freeShipping?.toLowerCase() === "true";
            existingProduct.shippingCharge =
              parseFloat(row.shippingCharge) || 0;
            existingProduct.customizable =
              row.customizable?.toLowerCase() === "true";
            if (subcategory) existingProduct.subcategory = subcategory._id;

            // Merge tags (keep existing non-default tags, add new ones)
            const defaultTags = new Set([
              "karachi",
              "pakistan",
              "onlineshopping",
              "viral",
              "irhasinn",
            ]);
            const existingTags = (existingProduct.tags || []).filter(
              (t) => !defaultTags.has(t.toLowerCase())
            );
            existingProduct.tags = [...new Set([...existingTags, ...tags])];

            // Prepend new images to existing images
            if (uploadedImages.length > 0) {
              existingProduct.images = [
                ...uploadedImages,
                ...existingProduct.images,
              ];
            }

            await existingProduct.save();
            updatedIds.push(existingProduct._id);
            updatedCount++;
          } else {
            // ── CREATE new product ──
            let baseSlug = slugify(row.name, { lower: true, strict: true });
            let slug = baseSlug;
            let counter = 1;
            while (await Product.findOne({ slug })) {
              slug = `${baseSlug}-${counter++}`;
            }

            const product = await Product.create({
              name: row.name.trim(),
              slug,
              description: row.description || "",
              price: derivedPrice,
              stock: derivedStock,
              category: category._id,
              subcategory: subcategory ? subcategory._id : undefined,
              brand: row.brand || "",
              colors,
              sizes,
              variantPricing,
              variantStock,
              tags,
              images: uploadedImages,
              freeShipping: row.freeShipping?.toLowerCase() === "true",
              shippingCharge: parseFloat(row.shippingCharge) || 0,
              customizable: row.customizable?.toLowerCase() === "true",
              addedBy: userId,
              user: userId,
            });

            // Push product into category (denormalized array, matches existing pattern)
            await Category.findByIdAndUpdate(category._id, {
              $push: { products: product._id },
            });

            createdIds.push(product._id);
            successCount++;
          }
        } catch (err) {
          // BUG-9: best-effort Cloudinary cleanup for images already uploaded
          // during this failed row so they don't become orphaned assets.
          for (const publicId of uploadedPublicIds) {
            await deleteFromCloudinary(publicId).catch((cleanupErr) =>
              console.error(
                "[BulkUpload] Orphan image cleanup failed:",
                cleanupErr?.message || cleanupErr
              )
            );
          }
          errors.push({
            row: rowNum,
            productName: row.name || "(unknown)",
            reason: err.message,
          });
        }
      })
    );

    // Update job progress after each batch
    await BulkUploadJob.findByIdAndUpdate(jobId, {
      successCount,
      updatedCount,
      failedCount: errors.length,
      errors,
      warnings,
      createdProductIds: createdIds,
    });
  }

  // Final status
  const finalStatus =
    errors.length === 0
      ? "completed"
      : successCount === 0 && updatedCount === 0
        ? "failed"
        : "completed_with_errors";

  await BulkUploadJob.findByIdAndUpdate(jobId, {
    status: finalStatus,
    successCount,
    updatedCount,
    failedCount: errors.length,
    errors,
    warnings,
    createdProductIds: createdIds,
  });
}

// ====================================================
// STEP C: Get job status (for admin to poll/check progress)
// ====================================================
export const getBulkUploadJobStatus = async (req, res, next) => {
  try {
    const job = await BulkUploadJob.findById(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    // BUG-12: admins may only read their own jobs; superadmin sees all.
    if (
      req.user.role !== "superadmin" &&
      job.uploadedBy?.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to view this job" });
    }
    return res.status(200).json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
};

// ====================================================
// STALE-JOB RECOVERY (protected maintenance endpoint, invoked by Vercel Cron)
// ====================================================
// Jobs stuck in "processing" — e.g. created before the runAfterResponse/
// waitUntil fix, or killed by an infrastructure event — would otherwise stay
// "processing" forever. This sweep transitions only genuinely stale jobs to
// "failed":
//   • Only jobs whose updatedAt is older than the threshold qualify
//     (the processor rewrites the job after every batch, so a healthy job
//     keeps moving updatedAt forward — see processRowsInBackground).
//   • The transition is an ATOMIC conditional update (status must still be
//     "processing" AND updatedAt must still be stale at write time), so a
//     job that became active again between query and update is never killed.
//   • Idempotent: once failed, the job no longer matches the filter, so the
//     error is never appended twice.
//   • Counters/errors/warnings/createdProductIds are preserved — this is a
//     job-state correction only. No retry, no rollback, no product changes.
const BULK_UPLOAD_STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const STALE_JOB_BATCH = 100;

async function recoverStaleBulkUploadJobs() {
  const cutoff = new Date(Date.now() - BULK_UPLOAD_STALE_THRESHOLD_MS);

  // Bounded: sweep at most STALE_JOB_BATCH stale jobs per invocation.
  const staleJobs = await BulkUploadJob.find({
    status: "processing",
    updatedAt: { $lt: cutoff },
  })
    .select("_id")
    .limit(STALE_JOB_BATCH)
    .lean();

  let recovered = 0;
  for (const { _id } of staleJobs) {
    // Atomic conditional update — the WHERE clause re-checks BOTH conditions
    // (status still "processing", updatedAt still stale) at write time. If a
    // running processor updated the job meanwhile, this write matches nothing
    // and the active job is untouched. Idempotent by construction: a failed
    // job can never match again.
    const result = await BulkUploadJob.updateOne(
      {
        _id,
        status: "processing",
        updatedAt: { $lt: cutoff },
      },
      {
        $set: { status: "failed" },
        $push: {
          errors: {
            row: 0,
            productName: "(system)",
            reason:
              "Bulk upload processing became inactive and did not complete. The system automatically marked this job as failed after it exceeded the stale processing threshold.",
          },
        },
      }
    );
    if (result.modifiedCount > 0) {
      recovered++;
      console.log(
        `[BulkUpload] Recovered stale job ${_id} -> failed (age > 1h)`
      );
    }
  }

  return { matched: staleJobs.length, recovered };
}

export const bulkUploadMaintenance = async (req, res, next) => {
  try {
    // Auth (per Vercel Cron convention): Vercel schedules send
    // "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set on the
    // project. Local/manual runs authenticate via the existing admin JWT
    // middleware chain. Deny when neither credential is presented.
    const authHeader = req.headers.authorization || "";
    const cronSecret = process.env.CRON_SECRET;
    const isCron =
      cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isAdmin =
      req.user &&
      (req.user.role === "superadmin" || req.user.role === "admin");
    if (!isCron && !isAdmin) {
      return next(createError(401, "Unauthorized maintenance request"));
    }

    const result = await recoverStaleBulkUploadJobs();
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// ====================================================
// STEP D: List recent bulk upload jobs
// ====================================================
export const getBulkUploadJobs = async (req, res, next) => {
  try {
    const jobs = await BulkUploadJob.find({ uploadedBy: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return res.status(200).json({ success: true, data: jobs });
  } catch (err) {
    next(err);
  }
};
