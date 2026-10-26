import express from "express";
import { getAnalyticsSummary } from "../Controllers/analyticsController.js";
import { verifyAdmin } from "../utils/commonFunctions.js";

export const analyticsRoute = express.Router();

analyticsRoute.get("/summary", verifyAdmin, getAnalyticsSummary);
