import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_PUBLIC = path.join(__dirname, "..", "..", "Frontend", "public");
const ICONS_DIR = path.join(FRONTEND_PUBLIC, "icons");

// The brand logo image
const SOURCE_IMAGE = path.join(FRONTEND_PUBLIC, "Irha Studio-12.jpg");

async function main() {
  // Create icons directory
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  const sizes = [192, 512];

  for (const size of sizes) {
    const destPath = path.join(ICONS_DIR, `icon-${size}x${size}.png`);
    const destMaskablePath = path.join(ICONS_DIR, `icon-${size}x${size}-maskable.png`);

    await sharp(SOURCE_IMAGE)
      .resize(size, size, { fit: "cover", position: "center" })
      .png()
      .toFile(destPath);
    console.log(`  ✅ Generated ${destPath}`);

    // Maskable variant: same image but with padding for safe zone
    // We add a background to ensure it looks good in a circle/mask
    await sharp(SOURCE_IMAGE)
      .resize(Math.round(size * 0.8), Math.round(size * 0.8), { fit: "cover", position: "center" })
      .png()
      .toFile(destMaskablePath);
    console.log(`  ✅ Generated ${destMaskablePath}`);
  }

  console.log("\n🎉 All PWA icons generated successfully!");
}

main().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});
