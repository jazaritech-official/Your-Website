import mongoose from "mongoose";

const bulkUploadJobSchema = new mongoose.Schema(
  {
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["processing", "completed", "completed_with_errors", "failed"],
      default: "processing",
    },
    totalRows: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    updatedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    errors: [
      {
        row: Number,
        productName: String,
        reason: String,
      },
    ],
    // Non-fatal per-row issues (e.g. one image URL failed but the product was
    // still processed). Separate from `errors` so failedCount stays accurate.
    warnings: [
      {
        row: Number,
        productName: String,
        reason: String,
      },
    ],
    createdProductIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    ],
  },
  { timestamps: true }
);

// Supports the stale-job recovery sweep:
// find({ status: "processing", updatedAt: { $lt: cutoff } })
bulkUploadJobSchema.index({ status: 1, updatedAt: 1 });

export default mongoose.model("BulkUploadJob", bulkUploadJobSchema);
