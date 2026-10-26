import express from "express";
import multer from "multer";
import { verifyToken, verifyAdmin } from "../utils/commonFunctions.js";
import {
  downloadTemplate,
  bulkUploadProducts,
  getBulkUploadJobStatus,
  getBulkUploadJobs,
  bulkUploadMaintenance,
} from "../Controllers/bulkProductController.js";

const router = express.Router();

// Separate multer config for bulk upload (larger limits, memory storage)
const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB total (images ZIP can be large)
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "dataFile") {
      const allowed = [".csv", ".xlsx", ".xls"];
      const ext = file.originalname.toLowerCase().slice(
        file.originalname.lastIndexOf(".")
      );
      if (!allowed.includes(ext)) {
        return cb(new Error("Data file must be .csv, .xlsx, or .xls"));
      }
    }
    if (file.fieldname === "imagesZip") {
      if (!file.originalname.toLowerCase().endsWith(".zip")) {
        return cb(new Error("Images file must be a .zip"));
      }
    }
    cb(null, true);
  },
});

router.get("/template", verifyToken, verifyAdmin, downloadTemplate);

router.post(
  "/upload",
  verifyToken,
  verifyAdmin,
  bulkUpload.fields([
    { name: "dataFile", maxCount: 1 },
    { name: "imagesZip", maxCount: 1 },
  ]),
  bulkUploadProducts
);

router.get("/jobs", verifyToken, verifyAdmin, getBulkUploadJobs);
router.get("/jobs/:jobId", verifyToken, verifyAdmin, getBulkUploadJobStatus);

// Maintenance endpoint for the stale-job recovery sweep. Invoked by Vercel
// Cron with "Authorization: Bearer <CRON_SECRET>"; local/manual runs may use
// the normal admin JWT chain. NOT publicly executable (see controller).
router.post(
  "/maintenance/recover-stale-jobs",
  verifyToken,
  bulkUploadMaintenance
);

export default router;
