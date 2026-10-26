import express from "express";
import { verifyAdmin } from "../utils/commonFunctions.js";
import { getOnlineUsers, presenceHeartbeat } from "../Controllers/onlineUsersController.js";
import { verifyToken } from "../utils/commonFunctions.js";

export const onlineUsersRoute = express.Router();

// Online users list — admin only (both reseller admins and superadmins)
onlineUsersRoute.get("/online-users", verifyAdmin, getOnlineUsers);
onlineUsersRoute.post("/presence/heartbeat", verifyToken, presenceHeartbeat);
