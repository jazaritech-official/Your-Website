import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

// Extended image format filter — accepts all common image types.
// HEIC/HEIF are included here so multer doesn't reject them early;
// the frontend compression step converts them to JPEG/WebP before sending.
const ALLOWED_EXTENSIONS = /jpeg|jpg|jfif|png|webp|gif|bmp|avif|heic|heif|tiff|tif/;
const ALLOWED_MIMES = [
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "image/gif", "image/bmp", "image/avif",
    "image/heic", "image/heif",
    "image/tiff", "image/tif",
];

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeOk = ALLOWED_MIMES.includes(file.mimetype);
    const extOk = ALLOWED_EXTENSIONS.test(ext);
    if (mimeOk || extOk) {
        cb(null, true);
    } else {
        cb(new Error(`Unsupported image format: ${file.originalname}. Accepted formats: JPG, PNG, WebP, GIF, AVIF, BMP`), false);
    }
};

// Vercel serverless functions enforce a ~4.5MB request body limit.
// Set multer limit to 4MB to stay safely under that threshold.
// The frontend compression step ensures large images are resized before sending.
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB per file (safe for Vercel serverless)

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 5,
    },
    fileFilter,
});
export default upload;