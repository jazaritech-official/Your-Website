import express from "express";
import {
  verifyAdmin,
  verifyThemeRevalidateTicket,
} from "../utils/commonFunctions.js";
import upload from "../middlewares/upload.js";
import {
  getPublicTheme,
  getThemeAdmin,
  updateTheme,
  uploadThemeLogo,
  removeThemeLogo,
  authorizeThemeRevalidate,
} from "../Controllers/themeController.js";

export const themeRoute = express.Router();

// ── Public (storefront root layout reads this on every page render) ──
themeRoute.get("/", getPublicTheme);

// ── Revalidation ticket check ──
// Called server-to-server by the storefront's /api/theme/revalidate route,
// which holds no signing key. The ticket is minted by a theme WRITE and is
// scoped + short-lived, so this is not a general auth bypass.
themeRoute.post(
  "/revalidate/authorize",
  verifyThemeRevalidateTicket,
  authorizeThemeRevalidate
);

// ── Admin ──
themeRoute.get("/admin", verifyAdmin, getThemeAdmin);
themeRoute.put("/admin", verifyAdmin, updateTheme);
themeRoute.post("/admin/logo", verifyAdmin, upload.single("image"), uploadThemeLogo);
themeRoute.delete("/admin/logo", verifyAdmin, removeThemeLogo);
