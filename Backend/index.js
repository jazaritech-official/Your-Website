import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { requestIdMiddleware } from "./middlewares/requestId.js";

import { connectDB, createLimiter } from "./utils/commonFunctions.js";
import { GEMINI_CONFIG } from "./utils/geminiConfig.js";
import { redisClient, isRedisReady } from "./utils/redisClient.js";
import { debugLog } from "./utils/debugLog.js";

import { authRoute } from "./Routes/authRoute.js";
import { productRouter } from "./Routes/productRoute.js";
import bulkProductRoute from "./Routes/bulkProductRoute.js";
import { categoryRoute } from "./Routes/categoryRoute.js";
import { subcategoryRoute } from "./Routes/subcategoryRoute.js";
import { orderRoute } from "./Routes/orderRoute.js";
import { cartRoute } from "./Routes/cartRoute.js";
import { analyticsRoute } from "./Routes/analyticsRoute.js";
import { adminRoute } from "./Routes/adminRoute.js";
import { homepageBannerRoute } from "./Routes/homepageBannerRoute.js";
import { homeSectionRoute } from "./Routes/homeSectionRoute.js";
import { pushRoute } from "./Routes/pushRoute.js";
import { notificationRoute } from "./Routes/notificationRoute.js";
import { chatRoute } from "./Routes/chatRoute.js";
import { onlineUsersRoute } from "./Routes/onlineUsersRoute.js";
import { trackingRoute } from "./Routes/trackingRoute.js";
import { referralRoute } from "./Routes/referralRoute.js";
import { settingsRoute } from "./Routes/settingsRoute.js";
import { themeRoute } from "./Routes/themeRoute.js";
import { pusherRoute } from "./Routes/pusherRoute.js";
import { paymentRoute } from "./Routes/paymentRoute.js";
import { riderRoute } from "./Routes/riderRoute.js";
import { reviewRoute } from "./Routes/reviewRoute.js";
import { brandProfileRoute } from "./Routes/brandProfileRoute.js";
import { pitchRecordRoute } from "./Routes/pitchRecordRoute.js";

import { migrateRoles } from "./scripts/migrateRoles.js";

/*
===========================================================
LOAD ENVIRONMENT VARIABLES
===========================================================
*/

dotenv.config();

/*
===========================================================
GLOBAL ERROR HANDLERS
===========================================================
*/

process.on("unhandledRejection", (reason) => {
  console.error(
    "[CRITICAL] Unhandled Promise Rejection:",
    reason
  );
});

process.on("uncaughtException", (error) => {
  console.error(
    "[CRITICAL] Uncaught Exception:",
    error
  );
});

/*
===========================================================
EXPRESS APP
===========================================================
*/

const app = express();

/*
===========================================================
BASIC APP CONFIGURATION
===========================================================
*/

app.disable("x-powered-by");

app.set("trust proxy", 1);

/*
===========================================================
COOKIE PARSER
===========================================================
*/

app.use(cookieParser());

/*
===========================================================
REQUEST CORRELATION ID
===========================================================
*/
app.use(requestIdMiddleware);

/*
===========================================================
BODY PARSERS
===========================================================
*/

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    limit: "10mb",
    extended: true,
  })
);

/*
===========================================================
CORS CONFIGURATION
===========================================================
*/

const allowedOrigins = [
  // Local development
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",

  // Production frontend
  "https://irhasinn.vercel.app",
  process.env.FRONTEND_URL,

  // Optional second production frontend URL
  process.env.FRONTEND_URL_2,
].filter(Boolean);

debugLog(
  "[CORS] Allowed Origins:",
  allowedOrigins
);

app.use(
  cors({
    origin: (origin, callback) => {
      /*
      Requests without an Origin header are allowed.

      This includes:
      - Postman
      - Thunder Client
      - Server-to-server requests
      - Some health checks
      */

      if (!origin) {
        return callback(null, true);
      }

      /*
      Allow only configured origins
      */

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error(
        `[CORS] Blocked Origin: ${origin}`
      );

      return callback(
        new Error(
          `Not allowed by CORS: ${origin}`
        )
      );
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],

    optionsSuccessStatus: 204,

    /*
    Cache successful preflight responses for 24h so the browser does not
    re-send an OPTIONS request before every cross-origin POST (the
    frontend/backend are on different Vercel domains and most writes use
    Content-Type: application/json + credentials). Still fully safe: origins
    are an explicit allow-list (never a wildcard) and credentials stay
    enabled.
    */

    maxAge: 86400,
  })
);

/*
===========================================================
SECURITY HEADERS
===========================================================
*/

app.use(
  helmet()
);

/*
===========================================================
GLOBAL RATE LIMITING
===========================================================
*/

/*
Coarse per-IP backstop applied to every request. Catches
scripted floods / scrapers that slip past the tighter
per-route limiters (auth, product, order, chat, cart,
notifications, push). Exclusions:
  - OPTIONS preflight (CORS — every cross-origin request
    would otherwise count twice against the budget)
  - Health checks (/ and /api/health/redis)
*/

app.use(
  createLimiter(200, 1, {
    skip: (req) =>
      req.method === "OPTIONS" ||
      req.path === "/" ||
      req.path === "/api/health/redis",
  })
);

/*
===========================================================
ENVIRONMENT VARIABLE VALIDATION
===========================================================
*/

const REQUIRED_ENV_VARS = [
  "MONGO",
  "JWT",
];

const missingVars =
  REQUIRED_ENV_VARS.filter(
    (variable) =>
      !process.env[variable]
  );

if (missingVars.length > 0) {
  console.error(
    `[ENV ERROR] Missing required environment variables: ${missingVars.join(
      ", "
    )}`
  );

  throw new Error(
    `Missing required environment variables: ${missingVars.join(
      ", "
    )}`
  );
}

/*
===========================================================
DATABASE INITIALIZATION
===========================================================
*/

/*
This flag prevents repeated initialization
inside the same running server instance.
*/

let initialized = false;

/*
This Promise prevents multiple simultaneous
requests from starting multiple DB connections
at the exact same time.
*/

let initializationPromise = null;

/*
===========================================================
INITIALIZE BACKEND
===========================================================
*/

async function initializeServer() {
  /*
  Already initialized
  */

  if (initialized) {
    return;
  }

  /*
  Initialization already running
  */

  if (initializationPromise) {
    return initializationPromise;
  }

  /*
  Start initialization
  */

  initializationPromise = (async () => {
    try {
      const initStart = Date.now();
      debugLog(
        "\n========================================"
      );

      debugLog(
        "🔄 Initializing Irhas'Inn Backend..."
      );

      debugLog(
        "========================================"
      );

      /*
      Connect to MongoDB
      */

      debugLog(
        "🗄️ Connecting to MongoDB..."
      );

      const mongoStart = Date.now();
      await connectDB();
      debugLog(`[PERF] MongoDB connect: ${Date.now() - mongoStart}ms`);

      debugLog(
        "✅ MongoDB Connected"
      );

      /*
      Migrate T-Shirt category to use the new size-based pricing flag.
      Idempotent: only sets the flag if the category exists and doesn't
      already have it. Gated behind RUN_MIGRATIONS=true to avoid an
      unnecessary DB query on every cold start.
      */
      if (process.env.RUN_MIGRATIONS === "true") {
        const migrationStart = Date.now();
        try {
          const { Category } = await import("./Models/Category.js");
          const tshirt = await Category.findOne({
            name: { $regex: /^t-shirt$/i },
            usesSizeBasedPricing: { $ne: true },
          });
          if (tshirt) {
            tshirt.usesSizeBasedPricing = true;
            await tshirt.save();
            debugLog(
              "✅ Migrated T-Shirt category: usesSizeBasedPricing = true"
            );
          }
        } catch (migErr) {
          console.error(
            "⚠️ T-Shirt migration failed (non-fatal):",
            migErr.message
          );
        }
        debugLog(`[PERF] T-Shirt migration check: ${Date.now() - migrationStart}ms`);
      }

      /*
      Log the RESOLVED Gemini models (after the deprecated-name guard in
      geminiConfig.js) — production logs must show exactly which models this
      deployment will call, so a stale env override can never hide again.
      */

      debugLog(
        "🤖 Gemini Models:",
        JSON.stringify(GEMINI_CONFIG)
      );
      debugLog(`[PERF] Total initialization: ${Date.now() - initStart}ms`);

      /*
      Run role migration — only when explicitly enabled (RUN_MIGRATIONS=true).
      Never runs on boot in production, so a deploy can never silently rewrite
      roles. Set RUN_MIGRATIONS=true locally to run it once, then unset it.
      */

      if (process.env.RUN_MIGRATIONS === "true") {
        debugLog(
          "🔄 Running Role Migration..."
        );

        await migrateRoles();

        debugLog(
          "✅ Role Migration Completed"
        );
      }

      /*
      Mark backend as initialized
      */

      initialized = true;

      debugLog(
        "========================================"
      );

      debugLog(
        "🚀 Irhas'Inn Store Backend Ready"
      );

      debugLog(
        `🌍 Environment: ${process.env.NODE_ENV ||
        "development"
        }`
      );

      debugLog(
        `☁️ Deployment: ${process.env.VERCEL
          ? "Vercel"
          : "Local / Traditional Server"
        }`
      );

      debugLog(
        "========================================\n"
      );
    } catch (error) {
      console.error(
        "❌ Backend Initialization Failed:",
        error
      );

      /*
      Reset the promise so another request
      can retry initialization.
      */

      initializationPromise = null;

      throw error;
    }
  })();

  return initializationPromise;
}

/*
===========================================================
REDIS HEALTH CHECK
===========================================================
*/

/*
Lightweight Redis connectivity probe: performs a real set/get
round-trip against the configured Upstash instance so deployments
can confirm the caching layer is alive. Registered BEFORE the
MongoDB-initialization middleware so it stays reachable even when
MongoDB is down (Redis availability is an independent signal).
Never throws — reports "unavailable" when Redis is off /
misconfigured, which is exactly the state the app gracefully falls
back to anyway.
*/

app.get(
  "/api/health/redis",
  async (_req, res) => {
    if (!isRedisReady()) {
      return res.status(200).json({
        success: true,
        redis: "unavailable",
        detail: process.env.REDIS_URL
          ? "Redis not connected — app running with caching disabled"
          : "REDIS_URL not configured — caching disabled",
        timestamp: new Date().toISOString(),
      });
    }

    let roundTrip = false;
    try {
      const testKey = `health:${Date.now()}`;
      await redisClient.set(testKey, "ok", "EX", 10);
      roundTrip = (await redisClient.get(testKey)) === "ok";
      await redisClient.del(testKey);
    } catch (err) {
      console.error(
        "[Redis] Health check round-trip failed:",
        err.message
      );
    }

    res.status(200).json({
      success: true,
      redis: roundTrip ? "connected" : "error",
      roundTrip,
      timestamp: new Date().toISOString(),
    });
  }
);

/*
===========================================================
DATABASE INITIALIZATION MIDDLEWARE
===========================================================
*/

/*
The first request initializes the backend.

Works with:
- Local Express
- Vercel Serverless Functions
*/

app.use(
  async (req, res, next) => {
    try {
      const reqStart = Date.now();
      await initializeServer();
      const initTime = Date.now() - reqStart;
      if (initTime > 100) {
        debugLog(`[PERF] Request ${req.method} ${req.originalUrl}: init took ${initTime}ms`);
      }

      // Measure response time and payload size
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        const elapsed = Date.now() - reqStart;
        const sizeKB = Buffer.byteLength(JSON.stringify(body), 'utf8') / 1024;
        if (elapsed > 200 || sizeKB > 10) {
          debugLog(`[PERF] Response ${req.method} ${req.originalUrl}: ${elapsed}ms, ${sizeKB.toFixed(1)}KB`);
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      next(error);
    }
  }
);

/*
===========================================================
HEALTH CHECK
===========================================================
*/

/*
This route confirms that the backend
is alive and responding.
*/

app.get(
  "/",
  (req, res) => {
    res.status(200).json({
      success: true,

      message:
        "Irhass'Inn Backend is running successfully 🚀",

      environment:
        process.env.NODE_ENV ||
        "development",

      deployment:
        process.env.VERCEL
          ? "Vercel"
          : "Local",

      timestamp:
        new Date().toISOString(),
    });
  }
);



/*
===========================================================
API ROUTES
===========================================================
*/

/*
AUTH ROUTES
/api/v1/auth/...
*/

app.use(
  "/api/v1/auth",
  authRoute
);

/*
PRODUCT ROUTES
/api/v1/product/...
*/

app.use(
  "/api/v1/product",
  productRouter
);

/*
BULK PRODUCT ROUTES
/api/v1/bulk-product/...
*/

app.use(
  "/api/v1/bulk-product",
  bulkProductRoute
);

/*
CATEGORY ROUTES
/api/v1/category/...
*/

app.use(
  "/api/v1/category",
  categoryRoute
);

/*
SUBCATEGORY ROUTES
/api/v1/subcategory/...
*/

app.use(
  "/api/v1/subcategory",
  subcategoryRoute
);

/*
ORDER ROUTES
/api/v1/order/...
*/

app.use(
  "/api/v1/order",
  orderRoute
);

/*
CART ROUTES
/api/v1/cart/...
*/

app.use(
  "/api/v1/cart",
  cartRoute
);

/*
ANALYTICS ROUTES
/api/v1/analytics/...
*/

app.use(
  "/api/v1/analytics",
  analyticsRoute
);

/*
ADMIN ROUTES
/api/v1/admin/...
*/

app.use(
  "/api/v1/admin",
  adminRoute
);

/*
ONLINE USERS ROUTES
/api/v1/admin/online-users
*/

app.use(
  "/api/v1/admin",
  onlineUsersRoute
);

/*
HOMEPAGE BANNER ROUTES
/api/v1/homepage-banners/...
*/

app.use(
  "/api/v1/homepage-banners",
  homepageBannerRoute
);

/*
HOME SECTIONS ROUTES
/api/v1/home-sections/...
*/

app.use(
  "/api/v1/home-sections",
  homeSectionRoute
);

/*
PUSH NOTIFICATION ROUTES
/api/v1/push/...
*/

app.use(
  "/api/v1/push",
  pushRoute
);

/*
NOTIFICATION ROUTES
/api/v1/notifications/...
*/

app.use(
  "/api/v1/notifications",
  notificationRoute
);

/*
CHAT ROUTES
/api/v1/chat/...
*/

app.use(
  "/api/v1/chat",
  chatRoute
);

/*
TRACKING ROUTES
/api/v1/tracking/...
*/

app.use(
  "/api/v1/tracking",
  trackingRoute
);

/*
REFERRAL ROUTES
/api/v1/referral/...
*/

app.use(
  "/api/v1/referral",
  referralRoute
);

/*
SETTINGS ROUTES
/api/v1/settings/...
*/

app.use(
  "/api/v1/settings",
  settingsRoute
);

/*
THEME / BRANDING ROUTES
/api/v1/theme/...
*/

app.use(
  "/api/v1/theme",
  themeRoute
);

/*
PUSHER ROUTES
/api/v1/pusher/...
*/

app.use(
  "/api/v1/pusher",
  pusherRoute
);

/*
PAYMENT ROUTES
/api/v1/payment/...
*/

app.use(
  "/api/v1/payment",
  paymentRoute
);

/*
RIDER APPLICATION ROUTES
/api/v1/rider/...
*/

app.use(
  "/api/v1/rider",
  riderRoute
);

/*
REVIEW ROUTES
/api/v1/reviews/...
*/

app.use(
  "/api/v1/reviews",
  reviewRoute
);

/*
BRAND SHOWCASE PROFILES ROUTES
/api/v1/brand-profiles/...
*/

app.use(
  "/api/v1/brand-profiles",
  brandProfileRoute
);

/*
CLIENT PITCH & SHOWCASE RECORDS ROUTES
/api/v1/pitch-records/...
*/

app.use(
  "/api/v1/pitch-records",
  pitchRecordRoute
);

/*
===========================================================
404 HANDLER
===========================================================
*/

/*
This MUST be after all valid routes.
*/

app.use(
  (req, res) => {
    res.status(404).json({
      success: false,

      status: 404,

      message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  }
);

/*
===========================================================
GLOBAL ERROR HANDLER
===========================================================
*/

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      "[GLOBAL ERROR]",
      err
    );

    /*
    CORS Error
    */

    if (
      err.message &&
      err.message.includes(
        "Not allowed by CORS"
      )
    ) {
      return res.status(403).json({
        success: false,

        status: 403,

        message:
          err.message,
      });
    }

    /*
    Multer Upload Errors
    (file size / file type — return proper status instead of 500)
    */

    if (
      err.name === "MulterError" &&
      err.code === "LIMIT_FILE_SIZE"
    ) {
      return res.status(413).json({
        success: false,

        status: 413,

        message:
          "Image too large — maximum allowed size is 4MB per image. Please choose a smaller image or let the system compress it automatically.",
      });
    }

    if (
      err.name === "MulterError" &&
      err.code === "LIMIT_UNEXPECTED_FILE"
    ) {
      return res.status(400).json({
        success: false,

        status: 400,

        message:
          err.message || "Unexpected file field",
      });
    }    if (
      err.status === 400 &&
      err.message &&
      (
        err.message.includes("Only JPEG") ||
        err.message.includes("SVG") ||
        err.message.includes("Invalid file extension") ||
        err.message.includes("Unsupported image format")
      )
    ) {
      return res.status(400).json({
        success: false,
        status: 400,
        message:
          err.message,
      });
    }

    /*
    General Error
    */

    const statusCode =
      err.status ||
      err.statusCode ||
      500;

    res.status(
      statusCode
    ).json({
      success: false,

      status: statusCode,

      message:
        err.message ||
        "Something went wrong",

      ...(err.code ? { code: err.code } : {}),

      /*
      Stack trace only in development
      */

      ...(process.env.NODE_ENV ===
        "development" && {
        stack:
          err.stack,
      }),
    });
  }
);

/*
===========================================================
LOCAL DEVELOPMENT SERVER
===========================================================
*/

/*
When running locally:

npm run start

Express starts on PORT 5000.

When deployed to Vercel:

process.env.VERCEL is set to "1" automatically.

Vercel directly uses:
export default app;
*/

if (!process.env.VERCEL) {
  const PORT =
    process.env.PORT ||
    5000;

  /*
  LOCAL DEVELOPMENT SERVER
  ===========================================================
  Real-time communication is handled by Pusher (managed service).
  The REST API publishes events to Pusher channels which are
  delivered to connected clients in real time.
  ===========================================================
  */

  app.listen(
    PORT,
    () => {
      debugLog(
        "\n========================================"
      );

      debugLog(
        "🚀 Irhas'Inn Backend Started"
      );

      debugLog(
        "========================================"
      );

      debugLog(
        `🌍 Environment: ${process.env.NODE_ENV ||
        "development"
        }`
      );

      debugLog(
        `🚪 Port: ${PORT}`
      );

      debugLog(
        `🌐 Local URL: http://localhost:${PORT}`
      );

      debugLog(
        `🔗 API Base: http://localhost:${PORT}/api/v1`
      );

      debugLog(
        "----------------------------------------"
      );

      debugLog(
        "🔐 Allowed Frontend Origins:"
      );

      allowedOrigins.forEach(
        (origin) => {
          debugLog(
            `   ✅ ${origin}`
          );
        }
      );

      debugLog(
        "========================================\n"
      );
    }
  );
}

/*
===========================================================
VERCEL SERVERLESS EXPORT
===========================================================
*/

export default app;