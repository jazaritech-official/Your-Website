import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { HomepageBanner } from "../Models/HomepageBanner.js";
import { Category } from "../Models/Category.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { connectDB } from "../utils/commonFunctions.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config: map of images to seed ──
// Carousel slides
const CAROUSEL_SLIDES = [
  {
    file: "carousel/Accessories.jpg",
    tag: "New Collection",
    title: "Premium Accessories",
    subtitle:
      "Elevate your style with our latest curated collection of premium accessories",
  },
  {
    file: "carousel/Clothes.jpg",
    tag: "Trending Now",
    title: "Fashion Forward",
    subtitle:
      "Discover the season's most sought-after fashion pieces for every occasion",
  },
  {
    file: "carousel/Decors.jpg",
    tag: "Lifestyle Edit",
    title: "Home Décor",
    subtitle:
      "Transform your space with elegant décor pieces that tell your story",
  },
  {
    file: "carousel/Electronic Devices.jpg",
    tag: "Tech Zone",
    title: "Electronics",
    subtitle:
      "Stay ahead with the latest gadgets and electronic essentials",
  },
  {
    file: "carousel/Home appliances.jpg",
    tag: "Smart Home",
    title: "Appliances",
    subtitle:
      "Make life easier with modern home appliances designed for comfort",
  },
  {
    file: "Azadi Collection.jpg",
    tag: "Limited Edition",
    title: "Azadi Collection",
    subtitle:
      "Celebrate freedom with our exclusive Azadi Collection — limited stock available",
  },
  {
    file: "Eid Collection Banner.jpg",
    tag: "Festival Special",
    title: "Eid Collection",
    subtitle:
      "Shop our curated Eid collection for the whole family — festive styles await",
  },
  {
    file: "Hajj Bannaer.jpg",
    tag: "Sacred Journey",
    title: "Hajj Essentials",
    subtitle:
      "Find everything you need for your blessed journey with our Hajj essentials",
  },
  {
    file: "mug banner.jpg",
    tag: "Customized",
    title: "Premium Mugs",
    subtitle:
      "Personalized mugs that make every sip special — perfect gifts for loved ones",
  },
  {
    file: "Pop Socket Banner.jpg",
    tag: "Accessories",
    title: "Pop Sockets",
    subtitle:
      "Customize your grip with trendy pop sockets — style meets function",
  },
  {
    file: "Irha Studio-12.jpg",
    tag: "Brand Story",
    title: "Irha's Inn Studio",
    subtitle:
      "Discover our signature collection at Irha's Inn — where style meets comfort",
  },
];

// Category banner entries — subset of carousel images + mapping to categories
const CATEGORY_BANNERS = [
  {
    file: "Azadi Collection.jpg",
    title: "Azaadi Collection",
    categoryName: "Clothes", // match against existing Category name
  },
  {
    file: "Eid Collection Banner.jpg",
    title: "Eid Collection",
    categoryName: "Accessories",
  },
  {
    file: "mug banner.jpg",
    title: "Customized Mugs",
    categoryName: "Accessories",
  },
  {
    file: "Hajj Bannaer.jpg",
    title: "Customized Hajj Gifts",
    categoryName: "Accessories",
  },
  {
    file: "Pop Socket Banner.jpg",
    title: "Customize Pop Socket",
    categoryName: "Accessories",
  },
];

async function readFileBuffer(relativePath) {
  // Try multiple possible locations for the public/ folder
  const possiblePaths = [
    path.join(__dirname, "..", "..", "Frontend", "public", relativePath),
    path.join(__dirname, "..", "..", "frontend", "public", relativePath),
    path.join(__dirname, "..", "..", "public", relativePath),
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
  }

  throw new Error(`File not found: ${relativePath} (tried ${possiblePaths.length} paths)`);
}

async function seed() {
  console.log("🔌 Connecting to database...");
  await connectDB();

  console.log("🧹 Clearing existing HomepageBanner collection...");
  await HomepageBanner.deleteMany({});

  // Fetch all existing categories for matching
  const allCategories = await Category.find({}).lean();
  console.log(
    `📂 Found ${allCategories.length} existing categories:`,
    allCategories.map((c) => c.name).join(", "),
  );

  // ── Upload carousel slides ──
  console.log("\n📸 Uploading carousel slides to Cloudinary...");
  let carouselOrder = 0;

  for (const slide of CAROUSEL_SLIDES) {
    try {
      console.log(`  → Uploading ${slide.file}...`);
      const buffer = await readFileBuffer(slide.file);
      const result = await uploadToCloudinary(buffer, "irhasinn/HomepageBanners");

      const banner = new HomepageBanner({
        type: "carousel",
        image: result.secure_url,
        imagePublicId: result.public_id,
        title: slide.title,
        subtitle: slide.subtitle,
        tag: slide.tag,
        order: carouselOrder++,
        isActive: true,
      });

      await banner.save();
      console.log(`    ✅ Created carousel slide: "${slide.title}"`);
    } catch (err) {
      console.error(`    ❌ Failed for ${slide.file}: ${err.message}`);
    }
  }

  // ── Upload category banners ──
  console.log("\n📸 Uploading category banners to Cloudinary...");
  let catBannerOrder = 0;

  for (const entry of CATEGORY_BANNERS) {
    try {
      // Find matching category
      const matchedCategory = allCategories.find(
        (cat) => cat.name.toLowerCase() === entry.categoryName.toLowerCase(),
      );

      console.log(
        `  → Uploading ${entry.file} (category: ${entry.categoryName}${matchedCategory ? " ✅ matched" : " ❌ not found"})...`,
      );

      const buffer = await readFileBuffer(entry.file);
      const result = await uploadToCloudinary(buffer, "irhasinn/HomepageBanners");

      const banner = new HomepageBanner({
        type: "categoryBanner",
        image: result.secure_url,
        imagePublicId: result.public_id,
        title: entry.title,
        categoryRef: matchedCategory?._id || null,
        order: catBannerOrder++,
        isActive: true,
      });

      await banner.save();
      console.log(`    ✅ Created category banner: "${entry.title}"`);
    } catch (err) {
      console.error(`    ❌ Failed for ${entry.file}: ${err.message}`);
    }
  }

  // ── Summary ──
  const totalCarousel = await HomepageBanner.countDocuments({ type: "carousel" });
  const totalCategoryBanners = await HomepageBanner.countDocuments({
    type: "categoryBanner",
  });

  console.log("\n========================================");
  console.log(`  ✅ Seed complete!`);
  console.log(`  🎠  Carousel slides: ${totalCarousel}`);
  console.log(`  🏷️  Category banners: ${totalCategoryBanners}`);
  console.log("========================================\n");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
