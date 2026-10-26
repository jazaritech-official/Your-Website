import Users from "../Models/Users.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";

export const updateUserRole = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!["user", "admin", "rider"].includes(role)) {
      return next(createError(400, "Role must be 'user', 'admin' or 'rider'"));
    }

    if (userId === req.user.id?.toString()) {
      return next(createError(400, "You cannot change your own role"));
    }

    const user = await Users.findById(userId);
    if (!user) return next(createError(404, "User not found"));

    user.role = role;
    user.isAdmin = role === "admin";
    await user.save();

    const { password, otp, otpExpires, otpAttempts, ...userDetails } = user._doc;
    return res.status(200).json(createSuccess(200, "Role updated successfully", userDetails));
  } catch (err) {
    next(err);
  }
};
