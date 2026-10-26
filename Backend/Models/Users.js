import mongoose from "mongoose";
let { Schema } = mongoose;

let UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phoneNo: {
      type: String,
      default: null,
    },
    orders: {
      type: Number,
      default: 0,
    },
    password: {
      type: String,
      default: null,
    },
    profilePic: {
      required: false,
      type: String,
      default: "",
    },
    address: {
      type: String,
      required: false,
      default: "",
    },
    cart: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: false,
        },
        quantity: {
          type: Number,
          required: true,
          default: 1,
          min: 1,
        },
        selectedColor: {
          type: String,
          default: "",
          trim: true,
        },
        selectedSize: {
          type: String,
          default: "",
          trim: true,
        },
        customizationAnswers: [
          {
            label: { type: String, required: true },
            value: { type: String, required: true },
          },
        ],
      },
    ],
    // Stores an HMAC-SHA256 hash of the 6-digit code — never the raw OTP.
    otp: {
      type: String,
      default: null,
    },
    otpExpires: {
      type: Date,
      default: null,
    },
    // Per-user failed-attempt counter (brute-force throttle). Hidden from all
    // query results by default so it can never leak into API responses.
    otpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    googleId: {
      type: String,
      default: null,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["user", "admin", "superadmin", "rider"],
      default: "user",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    wishlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    /*
    ===========================================================
    RIDER APPLICATION (self-service onboarding)
    ===========================================================
    riderApplicationStatus — tracks the self-service rider application lifecycle.
      "none"    = no application submitted (default for all users)
      "pending" = application submitted, awaiting admin approval
      "approved" = admin approved → role was set to "rider"
      "rejected" = admin rejected the application
    riderApplication — embedded subdocument holding the application data.
    riderApplicationAt — when the application was submitted.
    riderApprovedAt — when the admin approved (role changed to rider).
    */
    riderApplicationStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    riderApplication: {
      fullName: { type: String, default: "" },
      phoneNo: { type: String, default: "" },
      vehicleType: { type: String, default: "" },
      cnic: { type: String, default: "" },
      licensePlate: { type: String, default: "" },
      idDocumentUrl: { type: String, default: "" },
      licenseDocumentUrl: { type: String, default: "" },
    },
    riderApplicationAt: {
      type: Date,
      default: null,
    },
    riderApprovedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

/* Tier 3: fast lookup by username on login and admin user search — additive, no behavior change. */
UserSchema.index({ username: 1 });

/* Email lookup (login, registration duplicate check, admin search) — high-priority.
   Users.email already has `unique: true` which creates an index, but adding
   a case-insensitive index is NOT possible in Mongoose without text indexes;
   the existing unique index covers the common exact-match query pattern. */

/* Role-based queries (admin panel filtering, role checks) */
UserSchema.index({ role: 1 });

/* Fast lookup by phone number (login, registration duplicate check) */
UserSchema.index({ phoneNo: 1, role: 1 }, { sparse: true });

/* Cart user lookup */
UserSchema.index({ "cart.product": 1 }, { sparse: true });

export default mongoose.model("User", UserSchema);
