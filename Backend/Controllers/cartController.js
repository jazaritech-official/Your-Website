import Users from "../Models/Users.js";
import { Product } from "../Models/Product.js";
import { createError, createSuccess } from "../utils/commonFunctions.js";
import { uploadToCloudinary, deleteFromCloudinary, upload } from "../utils/cloudinary.js";
import {
  hasVariantInventory,
  sumVariantStocks,
  getEffectiveStock,
  getVariantStock,
  isProductInStock,
} from "../utils/inventory.js";
import { cartLineKey, cartLineHash, findCartLine } from "../utils/cartIdentity.js";

const populateUserCart = async (user) => {
  await user.populate(
    "cart.product",
    "name price stock description images slug brand category colors sizes customizable showCustomizationPreview customizationFields printLayout freeShipping shippingCharge variantPricing variantStock",
  );
  // Expose the deterministic line key so the client can address the exact
  // line (product + variant + customization) instead of the product alone,
  // which is ambiguous once the same product is customized differently.
  return user.cart.map((item) => ({
    ...item.toObject(),
    cartItemKey: cartLineHash(item),
  }));
};

/**
 * Determine the available stock for a specific cart item, considering
 * variant selection (color + size) when the product is variant-managed.
 *
 * @returns {{ availableStock: number, isVariant: boolean }}
 */
function getItemAvailableStock(product, selectedColor, selectedSize) {
  if (hasVariantInventory(product)) {
    const vs = getVariantStock(product, selectedColor, selectedSize);
    return { availableStock: vs, isVariant: true };
  }
  return { availableStock: getEffectiveStock(product), isVariant: false };
}

export const getCart = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(createError(401, "You are not authenticated"));
    }

    const user = await Users.findById(req.user.id);
    if (!user) return next(createError(404, "User not found"));

    const cart = await populateUserCart(user);
    return res.status(200).json(createSuccess(200, "Cart fetched successfully", cart));
  } catch (error) {
    next(error);
  }
};

export const uploadCustomizationImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(createError(400, "Image file is required"));
    }

    const result = await uploadToCloudinary(req.file.buffer, "irhasinn/customizations");

    return res.status(200).json(createSuccess(200, "Image uploaded successfully", {
      url: result.secure_url,
      publicId: result.public_id,
    }));
  } catch (error) {
    next(error);
  }
};

export const addOrUpdateCartItem = async (req, res, next) => {
  try {
    const { productId, quantity = 1, customizationAnswers, selectedColor, selectedSize } = req.body;
    if (!productId) return next(createError(400, "Product ID is required"));
    if (quantity < 0) return next(createError(400, "Quantity must be greater than or equal to 0"));

    const product = await Product.findById(productId);
    if (!product) return next(createError(404, "Product not found"));

    const user = await Users.findById(req.user.id);
    if (!user) return next(createError(404, "User not found"));

    // A line is matched by product + variant + customization, so adding the
    // same product again with DIFFERENT customization creates a separate line
    // instead of overwriting the previous line's answers.
    const incomingKey = cartLineKey({ productId, customizationAnswers });
    const existingItem = user.cart.find(
      (item) => cartLineKey(item) === incomingKey,
    );

    const desiredQuantity = existingItem ? existingItem.quantity + quantity : quantity;
    if (desiredQuantity <= 0) {
      user.cart = user.cart.filter((item) => cartLineKey(item) !== incomingKey);
    } else {
      // Resolve the effective stock based on variant selection
      const color = selectedColor || existingItem?.selectedColor || "";
      const size = selectedSize || existingItem?.selectedSize || "";
      const { availableStock, isVariant } = getItemAvailableStock(product, color, size);

      // When the product has variant inventory but NO size is selected yet
      // (e.g. Buy Now from a card with no size picker), allow the add-to-cart
      // and let the customer pick a size at checkout.  Only block when the
      // selected size is genuinely out of stock, or the product (non-variant)
      // has zero stock overall.
      const hasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;
      const sizeSelected = Boolean(size);
      const noSizeYet = isVariant && hasSizes && !sizeSelected;

      if (noSizeYet) {
        // No size chosen yet — check if there is ANY stock across all variants.
        // If every variant is 0, the product is genuinely out of stock.
        const totalVariantStock = sumVariantStocks(product);
        if (totalVariantStock <= 0) {
          return next(createError(400, "Product is out of stock"));
        }
        // Allow add — customer will select a size at checkout.
        // Quantity is clamped to 1 since we can't validate per-variant stock yet.
        const finalQuantity = Math.min(desiredQuantity, 1);

        if (existingItem) {
          existingItem.quantity = finalQuantity;
          if (selectedColor !== undefined) existingItem.selectedColor = selectedColor || "";
          if (selectedSize !== undefined) existingItem.selectedSize = selectedSize || "";
          if (customizationAnswers) existingItem.customizationAnswers = customizationAnswers;
        } else {
          user.cart.push({
            product: productId,
            quantity: finalQuantity,
            selectedColor: selectedColor || "",
            selectedSize: selectedSize || "",
            customizationAnswers: customizationAnswers || [],
          });
        }
        await user.save();
        const cart = await populateUserCart(user);
        return res.status(200).json(createSuccess(200, "Cart updated successfully", cart));
      }

      if (availableStock <= 0) {
        return next(createError(400, isVariant
          ? `Selected variant is out of stock`
          : "Product is out of stock"));
      }

      const finalQuantity = Math.min(desiredQuantity, availableStock);

      if (existingItem) {
        existingItem.quantity = finalQuantity;
        if (selectedColor !== undefined) existingItem.selectedColor = selectedColor || "";
        if (selectedSize !== undefined) existingItem.selectedSize = selectedSize || "";
        if (customizationAnswers) existingItem.customizationAnswers = customizationAnswers;
      } else {
        user.cart.push({
          product: productId,
          quantity: finalQuantity,
          selectedColor: selectedColor || "",
          selectedSize: selectedSize || "",
          customizationAnswers: customizationAnswers || [],
        });
      }
    }

    await user.save();
    const cart = await populateUserCart(user);
    return res.status(200).json(createSuccess(200, "Cart updated successfully", cart));
  } catch (error) {
    next(error);
  }
};

export const updateCartItem = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!productId) return next(createError(400, "Product ID is required"));
    if (quantity === undefined || quantity < 0) return next(createError(400, "Valid quantity is required"));

    const user = await Users.findById(req.user.id);
    if (!user) return next(createError(404, "User not found"));

    // `productId` is the cart LINE address: current clients send the
    // deterministic line key, legacy clients a bare product id — findCartLine
    // resolves both, preferring an exact line-key match.
    const existingItem = findCartLine(user, productId);
    if (!existingItem) return next(createError(404, "Cart item not found"));

    const lineKey = cartLineKey(existingItem);

    const product = await Product.findById(existingItem.product);
    if (!product) return next(createError(404, "Product not found"));

    if (quantity === 0) {
      user.cart = user.cart.filter((item) => cartLineKey(item) !== lineKey);
    } else {
      // Validate against the exact selected variant stock
      const { availableStock, isVariant } = getItemAvailableStock(
        product,
        existingItem.selectedColor || "",
        existingItem.selectedSize || "",
      );

      if (quantity > availableStock) {
        return next(createError(400, isVariant
          ? `Only ${availableStock} items available for the selected variant`
          : `Only ${availableStock} items available in stock`));
      }
      existingItem.quantity = quantity;
    }

    await user.save();
    const cart = await populateUserCart(user);
    return res.status(200).json(createSuccess(200, "Cart item updated successfully", cart));
  } catch (error) {
    next(error);
  }
};

export const removeCartItem = async (req, res, next) => {
  try {
    const { productId } = req.params;
    if (!productId) return next(createError(400, "Product ID is required"));

    const user = await Users.findById(req.user.id);
    if (!user) return next(createError(404, "User not found"));

    // Remove ONLY the addressed line. Matching on the product alone would
    // wipe every line of that product, including differently customized
    // ones. When nothing matches, the request stays a no-op (idempotent 200),
    // exactly as before.
    const existingItem = findCartLine(user, productId);
    user.cart = existingItem
      ? user.cart.filter((item) => cartLineKey(item) !== cartLineKey(existingItem))
      : user.cart.filter((item) => String(item.product) !== String(productId));
    await user.save();

    const cart = await populateUserCart(user);
    return res.status(200).json(createSuccess(200, "Cart item removed successfully", cart));
  } catch (error) {
    next(error);
  }
};

export const clearCart = async (req, res, next) => {
  try {
    const user = await Users.findById(req.user.id);
    if (!user) return next(createError(404, "User not found"));

    user.cart = [];
    await user.save();

    return res.status(200).json(createSuccess(200, "Cart cleared successfully", []));
  } catch (error) {
    next(error);
  }
};

export const syncCart = async (req, res, next) => {
  try {
    const { cartItems } = req.body;
    if (!Array.isArray(cartItems)) {
      return next(createError(400, "Cart items must be an array"));
    }

    const user = await Users.findById(req.user.id);
    if (!user) return next(createError(404, "User not found"));

    // N+1 → single batch lookup. Behavior is identical to the previous
    // per-item loop: same skip conditions (missing/falsy id, falsy quantity,
    // quantity < 1), same product filter (missing or out-of-stock skipped),
    // same stock clamp (min(quantity, stock)), same per-entry mapping, and
    // duplicates are still preserved as separate cart entries in request
    // order. A malformed product id still throws the same CastError → 500.
    const normalized = [];
    const validItems = [];
    for (const item of cartItems) {
      if (!item.productId || !item.quantity || item.quantity < 1) continue;
      validItems.push(item);
    }

    if (validItems.length > 0) {
      const productIds = [...new Set(validItems.map((item) => String(item.productId)))];
      const products = await Product.find({ _id: { $in: productIds } });
      const productById = new Map(products.map((p) => [String(p._id), p]));

      for (const item of validItems) {
        const product = productById.get(String(item.productId));
        if (!product) continue;

        // Variant-aware stock check
        const { availableStock } = getItemAvailableStock(
          product,
          item.selectedColor || "",
          item.selectedSize || "",
        );
        if (availableStock <= 0) continue;

        const qty = Math.min(item.quantity, availableStock);
        normalized.push({
          product: item.productId,
          quantity: qty,
          selectedColor: item.selectedColor || "",
          selectedSize: item.selectedSize || "",
          customizationAnswers: item.customizationAnswers || [],
        });
      }
    }

    user.cart = normalized;
    await user.save();
    const cart = await populateUserCart(user);

    return res.status(200).json(createSuccess(200, "Cart synchronized successfully", cart));
  } catch (error) {
    next(error);
  }
};
