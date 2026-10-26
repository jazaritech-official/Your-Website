import express from "express";
import { updateUserRole } from "../Controllers/adminController.js";
import { requireSuperAdmin } from "../utils/commonFunctions.js";

export const adminRoute = express.Router();

adminRoute.patch("/users/:userId/role", requireSuperAdmin, updateUserRole);
