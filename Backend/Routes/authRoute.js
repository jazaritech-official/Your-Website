import e from "express";
import { createLimiter, verifyAdmin, verifyToken, requireSuperAdmin } from "../utils/commonFunctions.js";
import {
  contactUs,
  getCurrentUser,
  deleteUser,
  getUser,
  getUsers,
  googleAuth,
  login,
  logout,
  register,
  resendOtp,
  setPassword,
  updateUser,
  verifyOtp,
} from "../Controllers/authController.js";
import upload from "../middlewares/upload.js";
import { verifyUser } from "../utils/commonFunctions.js";

import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from "../Controllers/wishlistController.js";

export let authRoute = e.Router();

authRoute.post("/register", upload.single("profilePic"), register);
authRoute.post("/google", createLimiter(10, 5), googleAuth);
authRoute.post("/verifyOtp", createLimiter(10), verifyOtp);
authRoute.post("/resendOtp", createLimiter(10), resendOtp);
authRoute.post("/login", createLimiter(10), login);
authRoute.put(
  "/updateUser/:id",
  verifyUser,
  upload.single("profilePic"),
  updateUser,
);
authRoute.post("/set-password", verifyToken, setPassword);
// Logout is POST (not GET) so it can't be triggered by <img> tags / prefetching
// (CSRF surface). No verifyToken: logout must also work with an expired token.
authRoute.post("/logout", logout);
// Only the Super Admin may delete users/admins/riders. Extra guards inside
// deleteUser prevent deleting the Super Admin or self-deletion.
authRoute.delete("/deleteUser/:id", requireSuperAdmin, deleteUser);
authRoute.get("/me", verifyToken, getCurrentUser);
authRoute.get("/getUser/:username", verifyToken, getUser);
authRoute.get("/getUsers", verifyAdmin, createLimiter(10), getUsers);
authRoute.post("/contact", createLimiter(5, 10), contactUs);

// Wishlist endpoints
authRoute.get("/wishlist", verifyUser, getWishlist);
authRoute.post("/wishlist/:productId", verifyUser, addToWishlist);
authRoute.delete("/wishlist/:productId", verifyUser, removeFromWishlist);
