import Users from "../Models/Users.js";
import { createError, createSuccess, resolveRole, invalidateAuthCache } from "../utils/commonFunctions.js";
import { debugLog } from "../utils/debugLog.js";
import { issueAuthToken } from "../utils/issueAuthCookie.js";
import bcrypt from "bcrypt";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import mongoose from "mongoose";
import { generateOTP, sendEmail } from "../utils/sendEmail.js"; // OTP generator + centralized email sender
import { runAfterResponse } from "../utils/afterResponse.js";
import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";
import { uploadToCloudinary } from "../utils/cloudinary.js";
dotenv.config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Escape regex special characters so user input is treated literally
// in $regex queries (same utility as productController.js).
const escapeRegExp = (str) =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const adminEmails = process.env.ADMIN_EMAILS
  ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
  : [];
const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
const riderEmails = process.env.RIDER_EMAILS
  ? process.env.RIDER_EMAILS.split(",").map((e) => e.trim().toLowerCase())
  : [];
// Both superadmin and reseller admins get isAdmin=true for backward compat
// Admin status comes from the `role` field on the User document,
// which is auto-assigned based on SUPER_ADMIN_EMAIL / ADMIN_EMAILS
// env vars at signup / login. The `isAdmin` boolean is kept for
// backward compatibility only — always prefer `role` going forward.
const isAdminEmail = (email) => {
  const e = (email || "").trim().toLowerCase();
  return e === superAdminEmail || adminEmails.includes(e);
};
const getRoleFromEmail = (email) => {
  const e = (email || "").trim().toLowerCase();
  if (e === superAdminEmail) return "superadmin";
  if (adminEmails.includes(e)) return "admin";
  if (riderEmails.includes(e)) return "rider";
  return "user";
};

// Reusable OTP email body builder — keeps the nice formatting in one place
// Plain text version (fallback for email clients that don't render HTML)
const buildOtpEmailText = (otp) =>
  `Hello,\n\nYour verification code for Irhas'Inn is: ${otp}\n\nThis code will expire in 10 minutes. If you did not request this, you can safely ignore this email.\n\nNeed help? Contact us at ${process.env.EMAIL}\n\nIrhas'Inn`;

// HTML themed version
const buildOtpEmailHtml = (otp) => `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Irhas'Inn Verification</title>
<style>
  @media only screen and (max-width: 520px) {
    .container { width: 100% !important; border-radius: 0 !important; }
    .inner-padding { padding: 28px 20px !important; }
    .otp-box { padding: 14px 20px !important; }
    .otp-code { font-size: 26px !important; letter-spacing: 4px !important; }
    .header-pad { padding: 22px 20px !important; }
    .footer-pad { padding: 18px 20px 24px 20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f2; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f2; padding: 40px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:480px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header with teal gradient (matches site theme #00ADB5) -->
          <tr>
            <td class="header-pad" style="background: linear-gradient(135deg, #00ADB5 0%, #007e84 100%); padding: 32px 32px;" align="center">
              <span style="color:#ffffff; font-size:24px; font-weight:bold; letter-spacing:1.5px; font-family: Arial, Helvetica, sans-serif; text-shadow: 0 1px 3px rgba(0,0,0,0.2);">Irhas'Inn</span>
            </td>
          </tr>

          <!-- Accent line -->
          <tr>
            <td style="height:5px; background: linear-gradient(90deg, #00ADB5, #222831, #00ADB5);"></td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="inner-padding" style="padding: 40px 36px 28px 36px;">
              <p style="margin:0 0 4px 0; color:#111111; font-size:17px; font-weight:600;">Verify your identity</p>
              <p style="margin:0 0 28px 0; color:#666666; font-size:14.5px; line-height:1.7;">
                Use the code below to complete your request. This code is valid for the next <strong style="color:#333;">10 minutes</strong>.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 4px 0 32px 0;">
                    <div class="otp-box" style="display:inline-block; background: linear-gradient(135deg, #e6f8f9 0%, #f0f9f9 100%); border: 1.5px solid #00ADB5; border-radius:10px; padding: 18px 42px;">
                      <span class="otp-code" style="font-size:32px; font-weight:bold; letter-spacing:8px; color:#00ADB5; font-family: 'Courier New', monospace;">${otp}</span>
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa; border-radius:8px; border-left: 4px solid #00ADB5;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px 0; color:#888888; font-size:13px; line-height:1.6;">
                      For your security, never share this code with anyone. Irhas'Inn staff will never ask for it.
                    </p>
                    <p style="margin:0; color:#999999; font-size:13px; line-height:1.6;">
                      Didn't request this? You can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 36px;">
              <hr style="border:none; border-top:1px solid #eeeeee; margin:0;" />
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="footer-pad" style="padding: 22px 36px 30px 36px;" align="center">
              <p style="margin:0 0 6px 0; color:#999999; font-size:12.5px;">Need help? Contact us at <a href="mailto:${process.env.EMAIL}" style="color:#00ADB5; text-decoration:none; font-weight:600;">${process.env.EMAIL}</a></p>
              <p style="margin:0 0 6px 0; color:#c2c2c2; font-size:11.5px;">Karachi, Pakistan</p>
              <p style="margin:0; color:#c2c2c2; font-size:12px;">© ${new Date().getFullYear()} Irhas'Inn. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
// ==========================================
// OTP HASHING & BRUTE-FORCE GUARD
// ==========================================
// The 6-digit code is emailed in plaintext (the user must read it), but only
// a keyed HMAC-SHA256 digest is persisted. A leaked database alone is NOT
// enough to brute-force the code offline — the HMAC key is derived from the
// server's JWT secret and never leaves the backend.
const MAX_OTP_ATTEMPTS = 5;

const getOtpKey = () =>
  createHash("sha256").update(`irhasinn-otp-v1|${process.env.JWT}`).digest();

const hashOtp = (otp) =>
  createHmac("sha256", getOtpKey()).update(String(otp)).digest("hex");

// Constant-time comparison so response timing leaks nothing about how close a
// guess was. SHA-256 digests are always 32 bytes; anything else fails closed.
const otpHashesMatch = (storedHash, submittedOtp) => {
  if (!storedHash || !submittedOtp) return false;
  const expected = Buffer.from(String(storedHash), "hex");
  if (expected.length !== 32) return false;
  const actual = Buffer.from(hashOtp(submittedOtp), "hex");
  return timingSafeEqual(expected, actual);
};

// ==========================================
// 1. REGISTER (With Email OTP Verification)
// ==========================================
export const register = async (req, res, next) => {
  try {
    if (!req.body) return next(createError(400, "All fields are required!"));

    const { username, email, phoneNo, password } = req.body;

    // Validation
    if (!username || !email || !phoneNo || !password) {
      return next(createError(400, "All Fields are required!"));
    }

    // Sanitize and validate username
    const sanitizedUsername = username.trim().replace(/[<>"'&]/g, "").trim();
    if (!sanitizedUsername || sanitizedUsername.length < 2 || sanitizedUsername.length > 30) {
      return next(createError(400, "Username must be between 2 and 30 characters"));
    }
    if (!/^[a-zA-Z0-9_\s]+$/.test(sanitizedUsername)) {
      return next(createError(400, "Username can only contain letters, numbers, spaces, and underscores"));
    }

    // Check if email OR Phone Number already exists
    const isExist = await Users.findOne({
      $or: [{ email: email }, { phoneNo: phoneNo }],
    });
    if (isExist)
      return next(createError(550, "Email, or Phone Number already exist!"));

    if (password.length < 6) {
      return next(
        createError(400, "Password should contain minimum 6 letters!"),
      );
    }
    // Hash password (async — unblocks event loop)
    const hash = await bcrypt.hash(password, 10);

    // Generate OTP
    const otp = generateOTP();
    if (!otp) return next(createError(500, "Failed to generate OTP!"));

    // Create new user
    const newUser = new Users({
      username: sanitizedUsername,
      email,
      phoneNo,
      password: hash,
      otp: hashOtp(otp),
      otpExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry
      isAdmin: isAdminEmail(email),
      role: getRoleFromEmail(email),
    });
    await newUser.save();

    const { password: _, otpExpires, otp: __, otpAttempts: ___, ...userDetails } = newUser._doc;

    // OTP email is DEFERRED off the request path (serverless-safe via
    // waitUntil — not a detached promise). The user + hashed OTP + expiry are
    // ALREADY persisted above, so the auth state is complete and correct;
    // delivery no longer blocks the response. A delivery failure is logged
    // and recoverable via resendOtp — the account stays usable and the OTP
    // remains valid until its 10-minute expiry.
    runAfterResponse(
      () =>
        sendEmail(
          email,
          "OTP for Email Verification",
          buildOtpEmailText(otp),
          buildOtpEmailHtml(otp),
        ),
      "register-otp",
    );
    console.info("[Auth] OTP email scheduled");

    // Response contract unchanged: otpSent stays true (the email was
    // scheduled; failures are logged and retryable).
    const otpSent = true;

    const data = createSuccess(
      201,
      "Verification OTP sent to your Email",
      { ...userDetails, otpSent },
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
};
// ==========================================
// 2. VERIFY OTP (By Email)
// ==========================================
export const verifyOtp = async (req, res, next) => {
  try {
    const { identifier, otp } = req.body;

    if (!identifier || !otp) {
      return next(createError(400, "Identifier and OTP are required!"));
    }

    const user = await Users.findOne({
      $or: [{ email: identifier }, { phoneNo: identifier }],
    });

    if (!user) {
      return next(createError(404, "User not found!"));
    }

    if (!user.otp || !user.otpExpires) {
      return next(createError(400, "OTP not requested or expired"));
    }

    if (Date.now() > new Date(user.otpExpires).getTime()) {
      user.otp = null;
      user.otpExpires = null;
      user.otpAttempts = 0;
      await user.save();

      return next(createError(400, "OTP has expired"));
    }

    if (!otpHashesMatch(user.otp, otp)) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
        // Brute-force guard: after repeated failures, invalidate the code so a
        // fresh one must be requested via resendOtp.
        user.otp = null;
        user.otpExpires = null;
        user.otpAttempts = 0;
        await user.save();
        return next(
          createError(400, "Too many incorrect attempts. Please request a new OTP."),
        );
      }
      await user.save();
      return next(createError(400, "Invalid OTP"));
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    user.otpAttempts = 0;
    user.isAdmin = isAdminEmail(user.email);
    user.role = getRoleFromEmail(user.email);
    await user.save();

    issueAuthToken(res, user);

    // otpAttempts is stripped so the response payload stays byte-identical to
    // before the attempt counter was introduced.
    const { password, otpAttempts, ...userDetails } = user._doc;
    const responseUser = { ...userDetails, role: resolveRole(user.email, user.role) };
    return res
      .status(200)
      .json(createSuccess(200, "Account Verified Successfully!", responseUser));
  } catch (error) {
    next(error);
  }
};

export const resendOtp = async (req, res, next) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return next(createError(400, "Email or Phone Number is required!"));
    }
    const user = await Users.findOne({
      $or: [{ email: identifier }, { phoneNo: identifier }],
    });
    if (!user) return next(createError(404, "User not found!"));

    const otp = generateOTP();
    if (!otp) return next(createError(500, "Failed to generate OTP!"));
    user.otp = hashOtp(otp);
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    // Fresh code, fresh attempt budget.
    user.otpAttempts = 0;
    await user.save();

    if (identifier.includes("@")) {
      // New OTP hash + expiry already persisted above — defer delivery so the
      // resend response never waits on Gmail SMTP. Failures are logged and
      // the user can simply resend again (a fresh code is generated each time).
      runAfterResponse(
        () =>
          sendEmail(
            identifier,
            "OTP for Email Verification",
            buildOtpEmailText(otp),
            buildOtpEmailHtml(otp),
          ),
        "resend-otp",
      );
      console.info("[Auth] OTP email scheduled");
    }

    res
      .status(200)
      .json(createSuccess(200, "OTP resent to your Email!"));
  } catch (error) {
    next(error);
  }
};
// ==========================================
// 3. LOGIN (Supports Email OR Phone Login)
// ==========================================
export const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body; // 'identifier' can be email OR phoneNo
    if (!identifier || !password) {
      return next(createError(400, "Email/Phone and Password are required!"));
    }

    // Find user by either email or phone number
    const user = await Users.findOne({
      $or: [{ email: identifier }, { phoneNo: identifier }],
    });
    // SECURITY: Use generic error to prevent account enumeration.
    // Never reveal whether the email/phone exists.
    if (!user) return next(createError(401, "Invalid email or password"));

    // Google-only users who haven't set a password yet must use Google sign-in.
    // Users who signed up via Google but have since set a password may log in
    // with email + password normally.
    if (user.googleId && !user.password) {
      return next(createError(400, "Please Login with Google"));
    }
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) return next(createError(401, "Invalid email or password"));

    if (isPasswordCorrect && !user.isVerified) {
      const otp = generateOTP();
      user.otp = hashOtp(otp);
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      user.otpAttempts = 0;
      await user.save();

      // New OTP hash + expiry already persisted above — defer delivery off
      // the login response path. The response contract (requiresVerification
      // + otpSent) is unchanged: otpSent reflects that an email was scheduled.
      if (identifier.includes("@")) {
        runAfterResponse(
          () =>
            sendEmail(
              identifier,
              "OTP for Email Verification",
              buildOtpEmailText(otp),
              buildOtpEmailHtml(otp),
            ),
          "login-otp",
        );
        console.info("[Auth] OTP email scheduled");
      }

      const otpSent = identifier.includes("@");

      return res.status(200).json({
        success: false,
        requiresVerification: true,
        otpSent,
        identifier: identifier,
        message: otpSent
          ? "OTP sent successfully!"
          : "Failed to send OTP. Please try again.",
      });
    }
    // Sync role from env vars on every login (so admin email changes take effect).
    // Preserve a DB-assigned rider role (set via Admin → Users) when the email
    // isn't managed in env vars — otherwise it would be reset on every login.
    const envRole = getRoleFromEmail(user.email);
    user.role = envRole === "user" && user.role === "rider" ? "rider" : envRole;
    user.isAdmin = isAdminEmail(user.email);
    await user.save();
    // Invalidate cached auth data so role changes take effect immediately
    invalidateAuthCache(user._id);

    const { password: _, otp, otpExpires, otpAttempts, ...userDetails } = user._doc;

    issueAuthToken(res, user);

    const loginResponseUser = {
      ...userDetails,
      role: resolveRole(user.email, user.role),
      hasPassword: !!user.password,
    };
    res
      .status(200)
      .json(createSuccess(200, "User Logged In Successfully", loginResponseUser));
  } catch (error) {
    next(error);
  }
};
// ==========================================
// 4. GOOGLE AUTH LOGIN / REGISTER
// ==========================================
export const googleAuth = async (req, res, next) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return next(createError(400, "Google credential is required!"));
    }

    // Verify Google Token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub } = payload;

    // Find User
    let user = await Users.findOne({ email });

    // .env se emails fetch karein
    const shouldBeAdmin = isAdminEmail(email);

    // Sync role from env vars on every Google auth (so admin email changes take effect)
    const computedRole = getRoleFromEmail(email);

    // If user does not exist (New Sign up)
    if (!user) {
      user = new Users({
        username: name.replace(/\s+/g, ""),
        email,
        profilePic: picture,
        googleId: sub,
        isVerified: true,
        isAdmin: shouldBeAdmin,
        role: computedRole,
      });
      await user.save();
    } else {
      // Agar existing user hai lekin .env mein admin add hua hai, toh update karein
      if (!user.isAdmin && shouldBeAdmin) {
        user.isAdmin = true;
        user.role = computedRole;
        await user.save();
      }
    }

    issueAuthToken(res, user);

    const { password, otp, otpExpires, otpAttempts, ...userDetails } = user._doc;
    const googleResponseUser = {
      ...userDetails,
      role: resolveRole(user.email, user.role),
      hasPassword: !!user.password,
    };

    res
      .status(200)
      .json(createSuccess(200, "Google Login Successful!", googleResponseUser));
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
    const { username } = req.params;
    const user = await Users.findOne({ username });
    if (!user) return next(createError(404, "User not found!"));

    // Security: profiles are private. Only the profile owner, or an
    // admin/superadmin, may view one — this closes the unauthenticated
    // username-enumeration and PII leak (phone, address, cart, wishlist).
    // All existing frontend callers (checkout, profile, editProfile, Navbar)
    // fetch the logged-in user's OWN profile with credentials, so they are
    // unaffected.
    const isOwner = req.user && user._id.toString() === req.user.id;
    const isAdmin =
      req.user &&
      (req.user.isAdmin ||
        req.user.role === "admin" ||
        req.user.role === "superadmin");
    if (!isOwner && !isAdmin) {
      return next(createError(403, "You are not authorized to view this profile"));
    }

    const { password, otp, otpExpires, otpAttempts, ...userDetails } = user._doc;
    const userWithRole = { ...userDetails, role: resolveRole(user.email, user.role) };
    res
      .status(200)
      .json(createSuccess(200, "User fetched successfully!", userWithRole));
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.search) {
      const safeSearch = escapeRegExp(req.query.search);
      // The User schema has no `name` path (it is `username`), so a `name`
      // clause could never match a stored document. Search covers the three
      // real fields: username, email and phone number.
      filter.$or = [
        { email: { $regex: safeSearch, $options: "i" } },
        { username: { $regex: safeSearch, $options: "i" } },
        { phoneNo: { $regex: safeSearch, $options: "i" } },
      ];
    }
    if (req.query.role) filter.role = req.query.role;

    const [users, total] = await Promise.all([
      Users.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-password -tokenVersion -otp -otpExpires -otpAttempts")
        .populate({
          path: "cart.product",
          select: "name price stock description images slug brand category",
        }),
      Users.countDocuments(filter),
    ]);

    // Browser cache for fast admin-panel back-navigation (see getAllOrders).
    res.set({
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      Vary: "Cookie",
    });

    res
      .status(200)
      .json(
        createSuccess(200, "Users fetched successfully!", {
          users,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1,
          },
        })
      );
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    // Ownership check: the caller must be the profile owner (matched by either
    // the MongoDB ObjectId OR the username) or an admin/superadmin. This mirrors
    // the verifyUser route middleware but tolerates username params too, since
    // the frontend historically calls PUT /auth/updateUser/<username>.
    const isOwnerById = req.params.id === req.user.id;
    const isOwnerByUsername = req.params.id === req.user.username;
    const isAdmin =
      req.user.role === "admin" ||
      req.user.role === "superadmin" ||
      req.user.isAdmin;

    if (!isOwnerById && !isOwnerByUsername && !isAdmin) {
      throw createError(401, "Unauthorized: cannot update this profile");
    }

    // Find the user by ObjectId OR username — both callers exist in the wild.
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
    const query = isObjectId
      ? { _id: req.params.id }
      : { username: req.params.id };

    const user = await Users.findOne(query);
    if (!user) return next(createError(404, "User not found!"));

    const isOwner = isOwnerById || isOwnerByUsername;
    const { username, email, phoneNo, password, address } = req.body;

    // ── Credentials are OWNER-ONLY ────────────────────────────────────────
    // Admins may edit profile data (name/username, phone, address, profile
    // image) for any user, but email and password are credentials: only the
    // account owner may change their own. This closes the admin account-
    // takeover path where one admin could reset another admin's (or the
    // Super Admin's) email/password. Super Admin profile management keeps
    // working — but silently changing credentials of any other account is
    // no longer possible without the owner's own session.
    if (!isOwner && (email || password)) {
      return next(
        createError(
          403,
          "Only the account owner can change their email or password"
        )
      );
    }

    if (username) user.username = username;
    if (isOwner && email) user.email = email;
    if (phoneNo) user.phoneNo = phoneNo;
    if (address) user.address = address;

    // If password is provided, hash it and increment tokenVersion to invalidate old sessions
    if (isOwner && password && password.length >= 6) {
      user.password = await bcrypt.hash(password, 10);
      user.tokenVersion = (user.tokenVersion || 0) + 1;
    }

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "irhasinn/products");
      user.profilePic = result.secure_url;
    }

    await user.save();
    // Invalidate auth cache so role/password changes take effect immediately
    invalidateAuthCache(user._id);

    // Return the RESOLVED role (env-admin/rider aware), exactly like login,
    // googleAuth, getCurrentUser and getUser. Returning the raw DB role here
    // let the frontend overwrite a resolved "superadmin" role with "user"
    // after a profile save, which hid the Admin Dashboard entry.
    const { password: _, otp, otpExpires, otpAttempts, ...userDetails } = user._doc;
    res
      .status(200)
      .json(
        createSuccess(200, "User updated successfully!", {
          ...userDetails,
          role: resolveRole(user.email, user.role),
          hasPassword: !!user.password,
        }),
      );
  } catch (error) {
    next(error);
  }
};

// ==========================================
// SET PASSWORD (for Google-auth users without one)
// ==========================================
export const setPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) {
      return next(createError(400, "Password is required!"));
    }
    if (password.length < 6) {
      return next(createError(400, "Password should contain minimum 6 letters!"));
    }

    const user = await Users.findById(req.user.id);
    if (!user) return next(createError(404, "User not found!"));

    // If user already has a password set, reject — this endpoint is only for
    // first-time password creation by Google-auth users.
    if (user.password) {
      return next(createError(400, "Password already set. Use profile settings to change it."));
    }

    user.password = await bcrypt.hash(password, 10);
    await user.save();

    // Invalidate auth cache so any stale auth data is refreshed
    invalidateAuthCache(user._id);

    const { password: _, otp, otpExpires, otpAttempts, ...userDetails } = user._doc;
    res
      .status(200)
      .json(
        createSuccess(200, "Password set successfully!", {
          ...userDetails,
          role: resolveRole(user.email, user.role),
          hasPassword: true,
        }),
      );
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    // Clear the access_token cookie with attributes that EXACTLY match the
    // original Set-Cookie from issueAuthToken (secure/sameSite/path/domain).
    // A mismatch (e.g. missing secure+sameSite in production) makes the browser
    // silently ignore the clear — the user would stay logged in. Setting an
    // expired cookie value instead of relying on clearCookie keeps the
    // attribute match explicit and reliable across browsers.
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("access_token", "", {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      expires: new Date(0), // epoch = immediate expiry
      path: "/", // must match the original path
      domain: isProd
        ? process.env.COOKIE_DOMAIN || undefined
        : undefined,
    });
    res.status(200).json(createSuccess(200, "User logged out successfully!"));
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    // Route-level middleware (requireSuperAdmin) already restricts this to
    // superadmins — these guards are defense-in-depth + proper API errors.
    const callerRole = req.user.role;
    if (callerRole !== "superadmin") {
      return next(createError(403, "Only the Super Admin can delete users"));
    }

    const target = await Users.findById(req.params.id);
    if (!target) return next(createError(404, "User not found"));

    // No one can delete the Super Admin.
    if (target.role === "superadmin") {
      return next(createError(403, "The Super Admin account cannot be deleted"));
    }

    // Prevent the Super Admin from deleting their own account accidentally.
    if (target._id.toString() === req.user.id) {
      return next(createError(400, "You cannot delete your own account"));
    }

    // ── Audit log (fire-and-forget) ──
    try {
      const { logAudit } = await import("../Models/AuditLog.js");
      await logAudit({
        action: "user.delete",
        target: { collection: "User", documentId: target._id, name: target.username || target.email },
        metadata: { deletedUserRole: target.role, deletedByEmail: target.email },
      }, req);
    } catch { /* swallow */ }

    await Users.findByIdAndDelete(req.params.id);
    res.status(200).json(createSuccess(200, "User deleted successfully!"));
  } catch (error) {
    next(error);
  }
};

export const contactUs = async (req, res, next) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return next(
        createError(400, "All fields (name, email, message) are required"),
      );
    }

    debugLog(`[Contact] Message from ${name} (${email}): ${message}`);

    // Contact form carries no DB state — defer delivery so the response never
    // waits on Gmail SMTP. Failures are logged by the helper.
    runAfterResponse(
      () =>
        sendEmail(
          process.env.EMAIL,
          `Contact Form: Message from ${name}`,
          `Name: ${name}\nEmail: ${email}\nMessage:\n${message}`,
        ),
      "contact-us",
    );



    res.status(200).json(createSuccess(200, "Message sent successfully!"));
  } catch (error) {
    next(error);
  }
};

// ==========================================
// GET CURRENT USER (session bootstrap)
// ==========================================
// Returns the authenticated user's data from the httpOnly JWT cookie.
// Used by the frontend to hydrate Redux state on app load, providing
// a server-truth source of user data that doesn't rely on localStorage.
export const getCurrentUser = async (req, res, next) => {
  try {
    // req.user.id and req.user.role are already set by verifyToken middleware,
    // which re-resolves role from the DB via resolveRole() on every request.
    const user = await Users.findById(req.user.id)
      .select("-password -otp -otpExpires -otpAttempts")
      .lean();

    if (!user) {
      return next(createError(404, "User not found"));
    }

    const userWithRole = {
      ...user,
      role: resolveRole(user.email, user.role),
      // hasPassword: derived from the full document (password was excluded by
      // .select()). We need one extra field, so fetch it separately.
    };

    // We need the raw password field to derive hasPassword.  Re-query with
    // password included but limit to just _id + password for minimal overhead.
    const passwordDoc = await Users.findById(req.user.id).select("password").lean();
    userWithRole.hasPassword = !!(passwordDoc && passwordDoc.password);

    res
      .status(200)
      .json(createSuccess(200, "Current user fetched", userWithRole));
  } catch (error) {
    next(error);
  }
};
