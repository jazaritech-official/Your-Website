import mongoose from "mongoose";

/**
 * AuditLog — records critical admin/system actions for traceability.
 *
 * WRITE-ONLY: the log is append-only by design.  Individual entries are
 * never updated or deleted (the collection can be capped or TTL-indexed
 * later without affecting the app).
 *
 * The logging helper must NOT throw — a failed audit write must never
 * block or fail the business action that triggered it.
 */

const auditLogSchema = new mongoose.Schema(
  {
    /* Who performed the action */
    actor: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      username: { type: String, default: "" },
      role: { type: String, default: "user" },
      ip: { type: String, default: "" },
    },
    /* What was done */
    action: {
      type: String,
      required: true,
      // e.g. "product.create", "order.status_change", "user.delete"
    },
    /* What was affected */
    target: {
      collection: { type: String, default: "" }, // e.g. "Product", "Order"
      documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
      name: { type: String, default: "" }, // human-readable name if available
    },
    /* Arbitrary metadata (previous/new status, fields changed, etc.) */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    /* HTTP context */
    method: { type: String, default: "" },
    path: { type: String, default: "" },
  },
  {
    timestamps: true,
  },
);

/* Index for admin dashboard queries (filter by actor, action, date range) */
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ "actor.userId": 1 });
auditLogSchema.index({ "target.collection": 1, "target.documentId": 1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);

/**
 * Safely log an audit entry.  NEVER throws — errors are swallowed so the
 * calling business action is never blocked by a logging failure.
 *
 * @param {object} entry
 * @param {object} req  Express request (optional — extracts IP and actor info)
 */
export async function logAudit(entry, req) {
  try {
    const logEntry = {
      action: entry.action || "unknown",
      target: entry.target || {},
      metadata: entry.metadata || {},
    };

    // Actor from req.user (set by verifyToken middleware)
    if (req?.user) {
      logEntry.actor = {
        userId: req.user.id,
        username: req.user.username || req.user.email || "",
        role: req.user.role || "user",
        ip: req?.ip || req?.connection?.remoteAddress || "",
      };
    } else if (entry.actor) {
      logEntry.actor = entry.actor;
    }

    // HTTP context from req
    if (req) {
      logEntry.method = req.method || "";
      logEntry.path = req.originalUrl || req.path || "";
    }

    // Fire-and-forget: don't await in the hot path.
    // Use create() which is a short-lived write — no persistent connection needed.
    AuditLog.create(logEntry).catch(() => {});
  } catch {
    // Swallow — audit logging must never fail the business action
  }
}
