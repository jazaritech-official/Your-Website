import Users from "../Models/Users.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";

export const getWishlist = async (req, res, next) => {
  try {
    const user = await Users.findById(req.user.id).populate("wishlist");
    if (!user) return next(createError(404, "User not found"));
    return res.status(200).json(createSuccess(200, "Wishlist fetched", user.wishlist));
  } catch (error) {
    next(error);
  }
};

export const addToWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;
    if (!productId) return next(createError(400, "Product ID is required"));

    const user = await Users.findById(req.user.id);
    if (!user) return next(createError(404, "User not found"));

    if (!user.wishlist.includes(productId)) {
      user.wishlist.push(productId);
      await user.save();
    }

    return res.status(200).json(createSuccess(200, "Added to wishlist"));
  } catch (error) {
    next(error);
  }
};

export const removeFromWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;
    if (!productId) return next(createError(400, "Product ID is required"));

    const user = await Users.findById(req.user.id);
    if (!user) return next(createError(404, "User not found"));

    user.wishlist = user.wishlist.filter((id) => id.toString() !== productId);
    await user.save();

    return res.status(200).json(createSuccess(200, "Removed from wishlist"));
  } catch (error) {
    next(error);
  }
};
