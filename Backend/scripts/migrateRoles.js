import Users from "../Models/Users.js";
import dotenv from "dotenv";
dotenv.config();

// Idempotent migration: seeds role field from .env into DB on startup.
// Safe to run every time — only updates users whose role is still "user" (default).
export const migrateRoles = async () => {
  try {
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const riderEmails = (process.env.RIDER_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    // Set superadmin
    if (superAdminEmail) {
      await Users.updateOne(
        { email: { $regex: new RegExp(`^${superAdminEmail}$`, "i") } },
        { $set: { role: "superadmin", isAdmin: true } }
      );
    }

    // Set reseller admins (only if not already superadmin)
    if (adminEmails.length) {
      await Users.updateMany(
        {
          email: { $in: adminEmails.map((e) => new RegExp(`^${e}$`, "i")) },
          role: { $ne: "superadmin" },
        },
        { $set: { role: "admin", isAdmin: true } }
      );
    }

    // Set riders (only if not admin/superadmin)
    if (riderEmails.length) {
      await Users.updateMany(
        {
          email: { $in: riderEmails.map((e) => new RegExp(`^${e}$`, "i")) },
          role: { $nin: ["superadmin", "admin"] },
        },
        { $set: { role: "rider" } }
      );
    }

    console.log("✅ Role migration complete");
  } catch (err) {
    console.error("Role migration failed:", err.message);
  }
};
