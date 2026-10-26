import Users from "../Models/Users.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { publishToUsers } from "../utils/pusherHelpers.js";

/* ============================================================
   RIDER APPLICATION — Self-Service Onboarding
   ============================================================
   Customers can apply to become delivery riders. An admin must
   approve the application before the user's role changes to
   "rider" (which unlocks the rider dashboard + real address
   access).
   ============================================================ */

/**
 * POST /rider/apply
 * Submit a rider application. Authenticated, any role except
 * already-rider or already-pending.
 */
export const applyForRider = async (req, res, next) => {
  try {
    const user = await Users.findById(req.user.id);
    if (!user) return next(createError(404, "User not found"));

    // Prevent duplicate applications
    if (user.role === "rider") {
      return next(createError(400, "You are already a rider"));
    }
    if (user.riderApplicationStatus === "pending") {
      return next(createError(400, "You already have a pending application"));
    }

    const { fullName, phoneNo, vehicleType, cnic, licensePlate } = req.body;

    // Validate required fields
    if (!fullName || !String(fullName).trim()) {
      return next(createError(400, "Full name is required"));
    }
    if (!phoneNo || !String(phoneNo).trim()) {
      return next(createError(400, "Phone number is required"));
    }
    if (!vehicleType || !String(vehicleType).trim()) {
      return next(createError(400, "Vehicle type is required"));
    }
    if (!cnic || !String(cnic).trim()) {
      return next(createError(400, "CNIC number is required"));
    }
    if (!licensePlate || !String(licensePlate).trim()) {
      return next(createError(400, "License plate is required"));
    }

    // Handle file uploads (ID document + license)
    let idDocumentUrl = "";
    let licenseDocumentUrl = "";

    if (req.files?.idDocument) {
      try {
        const result = await uploadToCloudinary(
          req.files.idDocument[0].buffer,
          "rider-documents"
        );
        idDocumentUrl = result.url;
      } catch (uploadErr) {
        console.error("[Rider] ID document upload failed:", uploadErr.message);
        return next(createError(500, "Failed to upload ID document"));
      }
    }
    if (req.files?.licenseDocument) {
      try {
        const result = await uploadToCloudinary(
          req.files.licenseDocument[0].buffer,
          "rider-documents"
        );
        licenseDocumentUrl = result.url;
      } catch (uploadErr) {
        console.error("[Rider] License document upload failed:", uploadErr.message);
        return next(createError(500, "Failed to upload license document"));
      }
    }

    // Save application
    user.riderApplicationStatus = "pending";
    user.riderApplication = {
      fullName: String(fullName).trim(),
      phoneNo: String(phoneNo).trim(),
      vehicleType: String(vehicleType).trim(),
      cnic: String(cnic).trim(),
      licensePlate: String(licensePlate).trim(),
      idDocumentUrl,
      licenseDocumentUrl,
    };
    user.riderApplicationAt = new Date();
    await user.save();

    // Notify admins about the new application
    try {
      const admins = await Users.find({ role: { $in: ["admin", "superadmin"] } })
        .select("_id")
        .lean();
      const adminIds = admins.map((a) => a._id.toString());
      if (adminIds.length > 0) {
        await publishToUsers(adminIds, "rider:application", {
          type: "new_application",
          userId: user._id,
          username: user.username,
          fullName: user.riderApplication.fullName,
          vehicleType: user.riderApplication.vehicleType,
          submittedAt: user.riderApplicationAt,
        });
      }
    } catch (notifErr) {
      console.error("[Rider] Admin notification error:", notifErr.message);
    }

    return res.status(201).json(
      createSuccess(201, "Application submitted successfully. We will review it shortly.", {
        status: user.riderApplicationStatus,
        submittedAt: user.riderApplicationAt,
      })
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /rider/application
 * Check own application status. Authenticated.
 */
export const getMyApplication = async (req, res, next) => {
  try {
    const user = await Users.findById(req.user.id)
      .select("riderApplicationStatus riderApplication riderApplicationAt riderApprovedAt role")
      .lean();
    if (!user) return next(createError(404, "User not found"));

    return res.status(200).json(
      createSuccess(200, "Application status fetched", {
        status: user.riderApplicationStatus || "none",
        application: user.riderApplication || null,
        submittedAt: user.riderApplicationAt || null,
        approvedAt: user.riderApprovedAt || null,
        isRider: user.role === "rider",
      })
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /admin/rider-applications
 * List all rider applications (admin only).
 * Query params: status=pending|approved|rejected (default: all)
 */
export const listRiderApplications = async (req, res, next) => {
  try {
    const filter = { riderApplicationStatus: { $in: ["pending", "approved", "rejected"] } };
    if (req.query.status && ["pending", "approved", "rejected"].includes(req.query.status)) {
      filter.riderApplicationStatus = req.query.status;
    }

    const users = await Users.find(filter)
      .select("username email phoneNo profilePic role riderApplicationStatus riderApplication riderApplicationAt riderApprovedAt")
      .sort({ riderApplicationAt: -1 })
      .lean();

    return res.status(200).json(
      createSuccess(200, "Rider applications fetched", users)
    );
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /admin/rider-applications/:userId/approve
 * Approve a rider application and set role to "rider". Admin only.
 */
export const approveRiderApplication = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await Users.findById(userId);
    if (!user) return next(createError(404, "User not found"));

    if (user.riderApplicationStatus !== "pending") {
      return next(createError(400, "This application is not pending"));
    }

    // Set role to rider
    user.role = "rider";
    user.riderApplicationStatus = "approved";
    user.riderApprovedAt = new Date();
    await user.save();

    // Invalidate auth cache so the role change takes effect immediately
    try {
      const { invalidateAuthCache } = await import("../utils/commonFunctions.js");
      await invalidateAuthCache(userId);
    } catch {
      // Non-fatal — cache expires in 5s anyway
    }

    // Notify the applicant
    try {
      const { Notification } = await import("../Models/Notification.js");
      await Notification.create({
        userId: user._id,
        title: "🎉 Rider Application Approved",
        message: "Congratulations! Your rider application has been approved. You can now access the Rider Dashboard.",
        link: "/rider",
      });
      await publishToUsers(userId, "notification:new", {
        title: "🎉 Rider Application Approved",
        message: "Congratulations! Your rider application has been approved.",
        link: "/rider",
      });
    } catch (notifErr) {
      console.error("[Rider] Approval notification error:", notifErr.message);
    }

    return res.status(200).json(
      createSuccess(200, "Application approved. User is now a rider.", {
        userId: user._id,
        role: user.role,
        status: user.riderApplicationStatus,
      })
    );
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /admin/rider-applications/:userId/reject
 * Reject a rider application. Admin only.
 */
export const rejectRiderApplication = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await Users.findById(userId);
    if (!user) return next(createError(404, "User not found"));

    if (user.riderApplicationStatus !== "pending") {
      return next(createError(400, "This application is not pending"));
    }

    user.riderApplicationStatus = "rejected";
    await user.save();

    // Notify the applicant
    try {
      const { Notification } = await import("../Models/Notification.js");
      await Notification.create({
        userId: user._id,
        title: "Rider Application Update",
        message: "Unfortunately, your rider application was not approved at this time. You can reapply after 30 days.",
        link: "/profile",
      });
      await publishToUsers(userId, "notification:new", {
        title: "Rider Application Update",
        message: "Your rider application was not approved at this time.",
        link: "/profile",
      });
    } catch (notifErr) {
      console.error("[Rider] Rejection notification error:", notifErr.message);
    }

    return res.status(200).json(
      createSuccess(200, "Application rejected", {
        userId: user._id,
        status: user.riderApplicationStatus,
      })
    );
  } catch (error) {
    next(error);
  }
};
