import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Category } from "../Models/Category.js";
import Users from "../Models/Users.js";
import { HomepageBanner } from "../Models/HomepageBanner.js";
import { connectDB, createSlug } from "../utils/commonFunctions.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findAdminUser() {
  const admin = await Users.findOne({
    $or: [{ role: "superadmin" }, { role: "admin" }, { isAdmin: true }],
  }).lean();

  if (admin) return admin;
  console.warn("⚠️  No admin user found. Categories will be created without user reference.");
  return null;
}

async function createCategories(adminUser) {
  const categoriesToCreate = [
    { name: "Clothes", description: "Fashion and apparel — trending styles for every occasion" },
    { name: "Accessories", description: "Premium accessories to complement your style" },
  ];

  const createdIds = {};

  for (const cat of categoriesToCreate) {
    const existing = await Category.findOne({ name: cat.name });
    if (existing) {
      console.log(`  ℹ️  Category "${cat.name}" already exists (${existing._id})`);
      createdIds[cat.name] = existing._id;
      continue;
    }

    // Create with a placeholder image (we'll use any available image)
    const category = new Category({
      name: cat.name,
      description: cat.description,
      slug: createSlug(cat.name),
      image: "", // Will be set below
      user: adminUser?._id || new mongoose.Types.ObjectId(),
      isActive: true,
    });

    // Try to set a banner image as the category image
    const bannerForCat = await HomepageBanner.findOne({
      type: "categoryBanner",
      title: cat.name === "Clothes" ? "Azaadi Collection" : "Eid Collection",
    }).lean();

    if (bannerForCat) {
      category.image = bannerForCat.image;
    } else {
      // Fallback: use any carousel image
      const anyBanner = await HomepageBanner.findOne({ type: "carousel" }).lean();
      if (anyBanner) category.image = anyBanner.image;
    }

    await category.save();
    console.log(`  ✅ Category "${cat.name}" created (${category._id})`);
    createdIds[cat.name] = category._id;
  }

  return createdIds;
}

// Upload a local image file to Cloudinary for the brand banner
async function uploadBrandBannerImage() {
  const possiblePaths = [
    path.join(__dirname, "..", "..", "Frontend", "public", "Irha Studio-12.jpg"),
    path.join(__dirname, "..", "..", "frontend", "public", "Irha Studio-12.jpg"),
    path.join(__dirname, "..", "..", "public", "Irha Studio-12.jpg"),
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      console.log(`  → Found brand image at: ${filePath}`);
      const buffer = fs.readFileSync(filePath);
      return await uploadToCloudinary(buffer, "irhasinn/HomepageBanners");
    }
  }
  return null;
}

async function createBrandBanner() {
  // Check if a brand banner already exists
  const existing = await HomepageBanner.findOne({ type: "brandBanner" });
  if (existing) {
    console.log(`  ℹ️  Brand banner already exists (${existing._id})`);
    return;
  }

  // Try to find the existing carousel banner with the same image
  const existingCarouselSlide = await HomepageBanner.findOne({
    title: "Irha's Inn Studio",
    type: "carousel",
  }).lean();

  if (existingCarouselSlide) {
    // Reuse the existing image data
    const brandBanner = new HomepageBanner({
      type: "brandBanner",
      image: existingCarouselSlide.image,
      imagePublicId: existingCarouselSlide.imagePublicId,
      title: "Irha's Inn Studio",
      subtitle: "Premium Quality — Delivered with Care Across Pakistan",
      order: 0,
      isActive: true,
    });
    await brandBanner.save();
    console.log(`  ✅ Brand banner created from existing carousel slide`);
    return;
  }

  // Upload the file fresh
  const result = await uploadBrandBannerImage();
  if (result?.secure_url && result?.public_id) {
    const brandBanner = new HomepageBanner({
      type: "brandBanner",
      image: result.secure_url,
      imagePublicId: result.public_id,
      title: "Irha's Inn Studio",
      subtitle: "Premium Quality — Delivered with Care Across Pakistan",
      order: 0,
      isActive: true,
    });
    await brandBanner.save();
    console.log(`  ✅ Brand banner created from fresh upload`);
  } else {
    console.warn("  ⚠️  Could not create brand banner — no image found");
  }
}

async function updateCategoryBannerRefs(categoryIds) {
  // Update category banners to link to the correct category
  const bannerMappings = [
    { title: "Azaadi Collection", categoryName: "Clothes" },
    { title: "Eid Collection", categoryName: "Accessories" },
    { title: "Customized Mugs", categoryName: "Accessories" },
    { title: "Customized Hajj Gifts", categoryName: "Accessories" },
    { title: "Customize Pop Socket", categoryName: "Accessories" },
  ];

  for (const mapping of bannerMappings) {
    const catId = categoryIds[mapping.categoryName];
    if (!catId) {
      console.warn(`  ⚠️  No category ID found for "${mapping.categoryName}", skipping`);
      continue;
    }

    const result = await HomepageBanner.updateMany(
      { type: "categoryBanner", title: mapping.title },
      { $set: { categoryRef: catId } },
    );
    if (result.modifiedCount > 0) {
      console.log(`  🔗 Linked "${mapping.title}" → "${mapping.categoryName}" (${result.modifiedCount})`);
    }
  }
}

async function main() {
  console.log("🔌 Connecting to database...");
  await connectDB();

  console.log("\n👤 Finding admin user...");
  const adminUser = await findAdminUser();

  console.log("\n📁 Creating missing categories...");
  const categoryIds = await createCategories(adminUser);

  console.log("\n🖼️  Creating brand banner...");
  await createBrandBanner();

  console.log("\n🔗 Updating category banner references...");
  await updateCategoryBannerRefs(categoryIds);

  // Summary
  const totalCarousel = await HomepageBanner.countDocuments({ type: "carousel" });
  const totalCatBanners = await HomepageBanner.countDocuments({ type: "categoryBanner" });
  const totalBrand = await HomepageBanner.countDocuments({ type: "brandBanner" });
  const totalCats = await Category.countDocuments({});

  console.log("\n========================================");
  console.log(`  ✅ Setup complete!`);
  console.log(`  🎠  Carousel slides: ${totalCarousel}`);
  console.log(`  🏷️  Category banners: ${totalCatBanners}`);
  console.log(`  🖼️  Brand banners: ${totalBrand}`);
  console.log(`  📂  Total categories: ${totalCats}`);
  console.log("========================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
