import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import multer from "multer";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// File ko buffer se upload karne ke liye stream method use karte hain
export const uploadToCloudinary = (fileBuffer, folderName = "uploads") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: folderName, resource_type: "auto" },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      },
    );

    stream.end(fileBuffer); // yahan buffer bhej diya
  });
};

export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    throw new Error("Cloudinary Deletion Failed: " + error.message);
  }
};

/**
 * Conservatively derive a Cloudinary public_id from a stored image URL.
 *
 * Only URLs that EXACTLY match the shape this project's own uploads produce
 * are accepted:
 *
 *   https://res.cloudinary.com/<cloud>/image/upload/v<version>/<folder>/<id>.<ext>
 *
 * (the `upload_stream` uploads here always include a version segment and never
 * add transformations). If `expectedFolder` is provided, the derived id must
 * start with that folder (e.g. "irhasinn/Category") — anything else returns
 * null so callers never risk deleting an unrelated Cloudinary asset.
 *
 * Used for legacy category records that predate the `imagePublicId` field and
 * only store the image URL.
 */
export const derivePublicIdFromUrl = (url, expectedFolder = null) => {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "res.cloudinary.com") return null;

    const marker = "/image/upload/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;

    let rest = parsed.pathname.slice(markerIndex + marker.length);

    // Optional version segment: /v<digits>/ — if present, strip it.
    const versionMatch = rest.match(/^v\d+\//);
    if (versionMatch) {
      rest = rest.slice(versionMatch[0].length);
    }

    // If there is no version segment, refuse to guess — transformed URLs and
    // other shapes may still be valid Cloudinary URLs but we cannot reliably
    // map them to a public_id.
    if (!versionMatch) return null;

    // Strip the file extension (the last dot-segment of the path).
    rest = rest.replace(/\.[a-zA-Z0-9]+$/, "");
    if (!rest) return null;

    if (expectedFolder && !rest.startsWith(`${expectedFolder}/`)) return null;

    return rest;
  } catch {
    return null;
  }
};

const storage = multer.memoryStorage();
export const upload = multer({ storage });

/**
 * Multer instance for chat image attachments.
 * Accepts JPG/JPEG/PNG/WEBP only, max 5 MB — mirroring the chat
 * image upload rules enforced on the frontend.
 */
export const uploadChatImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const error = new Error("Only JPG, JPEG, PNG, or WEBP images are allowed");
      error.status = 400;
      cb(error);
    }
  },
});

/**
 * Multer instance for cart customization image uploads
 * (POST /cart/upload-customization-image).
 * Strict image-only filter — blocks SVG (XSS risk), HTML and executables —
 * double-validated via MIME type AND file extension, with a 5 MB cap.
 */
const customizationFileFilter = (req, file, cb) => {
  // Block SVG (XSS risk), executables, and non-images
  const blockedTypes = [
    "image/svg+xml",
    "image/svg",
    "text/html",
    "application/javascript",
    "application/x-php",
  ];

  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ];

  if (blockedTypes.includes(file.mimetype)) {
    const error = new Error("SVG and executable files are not allowed");
    error.status = 400;
    return cb(error, false);
  }

  if (!allowedTypes.includes(file.mimetype)) {
    const error = new Error("Only JPEG, PNG, WebP, and GIF images are allowed");
    error.status = 400;
    return cb(error, false);
  }

  // Double validation: also check the file extension
  const ext = file.originalname.split(".").pop()?.toLowerCase();
  const allowedExts = ["jpg", "jpeg", "png", "webp", "gif"];
  if (!allowedExts.includes(ext)) {
    const error = new Error("Invalid file extension");
    error.status = 400;
    return cb(error, false);
  }

  cb(null, true);
};

export const uploadCustomizationImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: customizationFileFilter,
});

