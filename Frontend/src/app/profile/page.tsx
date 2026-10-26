"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Camera,
  User,
  Phone,
  MapPin,
  Save,
  Check,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Gift,
  ChevronRight,
  Bike,
  X,
  FileText,
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/app/Redux/store";
import {
  loginRequest,
  loginSuccess,
  loginFailure,
} from "@/app/Redux/Features/authSlice";
import useFetch, { baseUrl, showToast, invalidateCache } from "@/app/utils/commonFunctions";
import Link from "next/link";
import ProfileNav from "@/app/Components/ProfileNav";
import SetPasswordPrompt from "@/app/Components/SetPasswordPrompt";
import {
  Button,
  EmptyState,
  SectionLabel,
  buttonStyles,
} from "@/app/Components/ui";

const ProfilePage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);
  const [isMounted, setIsMounted] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [preview, setPreview] = useState<string>("/defaultAvatar.jpg");
  // F-015: track blob URLs for safe cleanup on unmount / replacement.
  const blobUrlRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [errors, setErrors] = useState<{
    username?: string;
    phoneNo?: string;
    address?: string;
  }>({});

  const [form, setForm] = useState({
    username: "",
    phoneNo: "",
    address: "",
  });

  const [originalForm, setOriginalForm] = useState({
    username: "",
    phoneNo: "",
    address: "",
  });

  // ── Rider application state ──
  const [riderStatus, setRiderStatus] = useState<"none" | "pending" | "approved" | "rejected" | "loading">("loading");
  const [riderForm, setRiderForm] = useState({
    fullName: "",
    phoneNo: "",
    vehicleType: "",
    cnic: "",
    licensePlate: "",
  });
  const [riderIdFile, setRiderIdFile] = useState<File | null>(null);
  const [riderLicenseFile, setRiderLicenseFile] = useState<File | null>(null);
  const [riderSubmitting, setRiderSubmitting] = useState(false);
  const [showRiderForm, setShowRiderForm] = useState(false);
  const [riderFormErrors, setRiderFormErrors] = useState<Record<string, string>>({});

  // Referral program flag — the SAME `programEnabled` value the checkout and
  // the referral landing gate already consume, so the Referral card can never
  // stay visible after an admin switches the program off.
  const [referralProgramEnabled, setReferralProgramEnabled] = useState(false);

  // Profile data — cached 30s; invalidated below after a profile edit so
  // the saved changes always show immediately.
  const { data: apiResponse } = useFetch<any>(
    auth.username ? `${baseUrl}auth/getUser/${auth.username}` : "",
    { cacheKey: "user_profile", staleTime: 30 * 1000 },
  );

  // ── Fetch rider application status ──
  useEffect(() => {
    if (!auth.username) return;
    axios
      .get(`${baseUrl}rider/application`, { withCredentials: true })
      .then((res) => {
        const status = res.data?.data?.status || "none";
        setRiderStatus(status);
        if (res.data?.data?.application) {
          setRiderForm({
            fullName: res.data.data.application.fullName || "",
            phoneNo: res.data.data.application.phoneNo || "",
            vehicleType: res.data.data.application.vehicleType || "",
            cnic: res.data.data.application.cnic || "",
            licensePlate: res.data.data.application.licensePlate || "",
          });
        }
      })
      .catch(() => setRiderStatus("none"));
  }, [auth.username]);

  // ── Fetch the referral program flag (presentation gating only) ──
  useEffect(() => {
    if (!auth.username) return;
    axios
      .get(`${baseUrl}referral/overview`, { withCredentials: true })
      .then((res) => {
        setReferralProgramEnabled(res.data?.data?.programEnabled !== false);
      })
      .catch(() => {
        // Silent — if the flag cannot be read, the card simply stays hidden.
        setReferralProgramEnabled(false);
      });
  }, [auth.username]);

  useEffect(() => {
    setIsMounted(true);
    if (apiResponse?.data) {
      const d = apiResponse.data;
      setUserId(d._id);
      const initialForm = {
        username: d.username || "",
        phoneNo: d.phoneNo?.toString() || "",
        address: d.address || "",
      };
      setForm(initialForm);
      setOriginalForm(initialForm);
      setPreview(d.profilePic || "/defaultAvatar.jpg");
    }
  }, [apiResponse]);

  const validateForm = () => {
    const newErrors: typeof errors = {};

    if (!form.username.trim()) {
      newErrors.username = "Username is required";
    } else if (form.username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    } else if (form.username.length > 20) {
      newErrors.username = "Username must not exceed 20 characters";
    }

    if (form.phoneNo && !/^\d{10,15}$/.test(form.phoneNo.replace(/\D/g, ""))) {
      newErrors.phoneNo = "Phone number must be 10-15 digits";
    }

    if (form.address && form.address.length > 500) {
      newErrors.address = "Address must not exceed 500 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    setHasChanges(
      value !== originalForm[name as keyof typeof originalForm] || !!file,
    );
    if (errors[name as keyof typeof errors]) {
      setErrors({ ...errors, [name]: undefined });
    }
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const img = e.target.files?.[0];
    if (img) {
      if (img.size > 5 * 1024 * 1024) {
        showToast("Image size must be less than 5MB", "error");
        return;
      }
      if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(img.type)) {
        showToast("Please upload a valid image file (JPEG, PNG, GIF, WebP)", "error");
        return;
      }
      setFile(img);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      const url = URL.createObjectURL(img);
      blobUrlRef.current = url;
      setPreview(url);
      setHasChanges(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!validateForm()) {
      showToast("Please fix the errors in the form", "error");
      return;
    }
    dispatch(loginRequest());
    try {
      const fd = new FormData();
      fd.append("username", form.username.trim());
      fd.append("phoneNo", form.phoneNo.trim());
      fd.append("address", form.address.trim());
      if (file) fd.append("profilePic", file);

      const res = await axios.put(`${baseUrl}auth/updateUser/${userId}`, fd, {
        withCredentials: true,
      });

      dispatch(loginSuccess({
        ...res.data.data,
        isAdmin: res.data.data?.isAdmin ?? false,
      }));
      // The cached profile payload is now stale — drop it so the next render
      // refetches fresh data.
      invalidateCache("user_profile");
      showToast("Profile updated successfully!", "success");
      setOriginalForm(form);
      setFile(null);
      setHasChanges(false);
    } catch (err: any) {
      dispatch(loginFailure("Update failed"));
      showToast(err.response?.data?.message || "Failed to update profile", "error");
    }
  };

  if (!isMounted) return null;

  // Route guard: same inline fallback used by the wishlist / chat pages.
  // `auth` hydrates synchronously from localStorage (see authSlice), so this
  // is accurate by first client render — no flash for logged-in users.
  if (!auth.username) {
    return (
      <main className="min-h-screen bg-surface-page px-4 pb-16 pt-8">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={<User size={26} />}
            title="Sign in to view your profile"
            description="Your details, order history and referral rewards live here once you sign in."
            action={
              <Link href="/" className={buttonStyles({ variant: "gold", size: "md" })}>
                <ArrowLeft size={16} /> Back to Home
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-surface-page px-4 pb-16 pt-8 font-sans">
      {/* One group entrance for the whole account overview — the rider
          form and the Set-Password prompt animate themselves. */}
      <div className="mx-auto max-w-3xl ir-fade-in-up">
        {/* Back + Header */}
        <div className="mb-5">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-brand-gold-hover"
          >
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <SectionLabel>Your account</SectionLabel>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-brand-navy sm:text-4xl">
            My Profile
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Keep your information up to date — it is used for deliveries and order updates.
          </p>
        </div>

        <ProfileNav referralEnabled={referralProgramEnabled} />

        {/* Set Password prompt for Google-auth users without a password */}
        <div className="mb-6">
          <SetPasswordPrompt />
        </div>

        {/* Referral Rewards quick link — rendered ONLY while the program is on
            in admin settings (same `programEnabled` flag checkout consumes). */}
        {referralProgramEnabled && (
          <Link
            href="/profile/referral"
            className="group mb-6 flex items-center justify-between rounded-card border border-line bg-surface p-4 shadow-card transition-[border-color,box-shadow] hover:border-brand-gold/40 hover:shadow-card-hover"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-brand-navy">
                <Gift className="h-5 w-5 text-brand-gold" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-brand-navy">Referral Center</p>
                <p className="text-xs text-ink-muted">
                  Earn rewards when friends shop with your code
                </p>
              </div>
            </div>
            <ChevronRight
              size={18}
              aria-hidden
              className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-1 group-hover:text-brand-gold-hover"
            />
          </Link>
        )}

        {/* ── Become a Rider card ── */}
        {riderStatus !== "loading" && (
          <>
            {riderStatus === "none" && (
              <button
                onClick={() => {
                  setRiderForm({
                    fullName: form.username || "",
                    phoneNo: form.phoneNo || "",
                    vehicleType: "",
                    cnic: "",
                    licensePlate: "",
                  });
                  setShowRiderForm(true);
                }}
                className="group mb-6 flex w-full items-center justify-between rounded-card border border-brand-gold/30 bg-brand-gold/[0.06] p-4 shadow-card transition-[border-color,box-shadow] hover:border-brand-gold/60 hover:shadow-card-hover"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-brand-navy">
                    <Bike className="h-5 w-5 text-brand-gold" aria-hidden />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-brand-navy">Become a Delivery Rider</p>
                    <p className="text-xs text-ink-muted">
                      Deliver orders and earn with flexible schedules
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  aria-hidden
                  className="shrink-0 text-brand-gold-hover transition-transform group-hover:translate-x-1"
                />
              </button>
            )}
            {riderStatus === "pending" && (
              <div className="mb-6 flex items-center gap-3 rounded-card border border-state-warning/25 bg-state-warning/[0.06] p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-state-warning/12">
                  <Loader2 className="h-5 w-5 animate-spin text-state-warning" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-state-warning">Application Under Review</p>
                  <p className="text-xs text-ink-muted">
                    Your rider application is being reviewed by our team.
                  </p>
                </div>
              </div>
            )}
            {riderStatus === "approved" && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-state-success/25 bg-state-success/[0.06] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-state-success/12">
                    <Check className="h-5 w-5 text-state-success" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-state-success">You are a Rider</p>
                    <p className="text-xs text-ink-muted">
                      Access your rider dashboard to manage deliveries.
                    </p>
                  </div>
                </div>
                <Link
                  href="/rider"
                  className={buttonStyles({ variant: "primary", size: "sm" })}
                >
                  Open Dashboard
                </Link>
              </div>
            )}
            {riderStatus === "rejected" && (
              <div className="mb-6 flex items-center gap-3 rounded-card border border-line bg-surface-muted p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-surface">
                  <X className="h-5 w-5 text-ink-muted" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-brand-navy">Application Not Approved</p>
                  <p className="text-xs text-ink-muted">
                    Your previous application was not approved. You may reapply after 30 days.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="h-1 bg-gradient-to-r from-brand-gold via-brand-gold/40 to-transparent" />
          <div className="p-6 sm:p-8 md:p-10">
            {/* Avatar */}
            <div className="mb-10 flex flex-col items-center">
              <label className="group relative mb-4 cursor-pointer">
                <div className="relative h-32 w-32 overflow-hidden rounded-card bg-surface-muted ring-4 ring-line transition-shadow duration-300 group-hover:ring-brand-gold/40 sm:h-40 sm:w-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Profile photo" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-brand-navy/55 opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100">
                    <div className="flex flex-col items-center gap-2">
                      <Camera className="h-8 w-8 text-white" aria-hidden />
                      <span className="text-xs font-semibold uppercase text-white">
                        Change Photo
                      </span>
                    </div>
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImage}
                  className="sr-only"
                />
                <span className="sr-only">Change profile photo</span>
              </label>
              <p className="text-center text-sm text-ink-muted">
                PNG, JPG, GIF or WebP &bull; Max 5MB
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username */}
              <div>
                <label
                  htmlFor="profile-username"
                  className="mb-1.5 block text-[13px] font-semibold text-brand-navy"
                >
                  Username
                </label>
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle">
                    <User size={19} />
                  </span>
                  <input
                    id="profile-username"
                    type="text"
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    placeholder="Enter your username"
                    aria-invalid={Boolean(errors.username) || undefined}
                    aria-describedby={errors.username ? "profile-username-error" : undefined}
                    /* Error state is now visually distinct — it previously used
                       the SAME border colour as the valid state. */
                    className={`h-12 w-full rounded-field border bg-surface pl-12 pr-4 text-[15px] font-medium text-brand-navy outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:ring-4 ${
                      errors.username
                        ? "border-state-danger/60 focus:border-state-danger focus:ring-state-danger/15"
                        : "border-line focus:border-brand-gold focus:ring-brand-gold/15"
                    }`}
                  />
                </div>
                {errors.username && (
                  <p
                    id="profile-username-error"
                    role="alert"
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-state-danger"
                  >
                    <AlertCircle size={14} aria-hidden /> {errors.username}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label
                  htmlFor="profile-phone"
                  className="mb-1.5 block text-[13px] font-semibold text-brand-navy"
                >
                  Phone Number
                </label>
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle">
                    <Phone size={19} />
                  </span>
                  <input
                    id="profile-phone"
                    type="tel"
                    name="phoneNo"
                    value={form.phoneNo}
                    onChange={handleChange}
                    placeholder="Enter phone number (10-15 digits)"
                    aria-invalid={Boolean(errors.phoneNo) || undefined}
                    aria-describedby={errors.phoneNo ? "profile-phone-error" : undefined}
                    className={`h-12 w-full rounded-field border bg-surface pl-12 pr-4 text-[15px] font-medium text-brand-navy outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:ring-4 ${
                      errors.phoneNo
                        ? "border-state-danger/60 focus:border-state-danger focus:ring-state-danger/15"
                        : "border-line focus:border-brand-gold focus:ring-brand-gold/15"
                    }`}
                  />
                </div>
                {errors.phoneNo && (
                  <p
                    id="profile-phone-error"
                    role="alert"
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-state-danger"
                  >
                    <AlertCircle size={14} aria-hidden /> {errors.phoneNo}
                  </p>
                )}
              </div>

              {/* Address */}
              <div>
                <label
                  htmlFor="profile-address"
                  className="mb-1.5 block text-[13px] font-semibold text-brand-navy"
                >
                  Full Address
                </label>
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute left-4 top-3.5 text-ink-subtle">
                    <MapPin size={19} />
                  </span>
                  <textarea
                    id="profile-address"
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    placeholder="Enter your full address (street, city, country)"
                    rows={4}
                    maxLength={500}
                    aria-invalid={Boolean(errors.address) || undefined}
                    aria-describedby={errors.address ? "profile-address-error" : undefined}
                    className={`w-full resize-none rounded-field border bg-surface py-3 pl-12 pr-4 text-[15px] font-medium text-brand-navy outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:ring-4 ${
                      errors.address
                        ? "border-state-danger/60 focus:border-state-danger focus:ring-state-danger/15"
                        : "border-line focus:border-brand-gold focus:ring-brand-gold/15"
                    }`}
                  />
                  <p className="mt-1 text-right text-xs font-medium text-ink-subtle">
                    {form.address.length}/500
                  </p>
                </div>
                {errors.address && (
                  <p
                    id="profile-address-error"
                    role="alert"
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-state-danger"
                  >
                    <AlertCircle size={14} aria-hidden /> {errors.address}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                <Button
                  type="submit"
                  variant="gold"
                  size="lg"
                  className="flex-1"
                  loading={auth.loading}
                  disabled={!hasChanges}
                  icon={<Save size={18} aria-hidden />}
                >
                  {auth.loading ? "Updating..." : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={() => { setForm(originalForm); setFile(null); setPreview(apiResponse?.data?.profilePic || "/defaultAvatar.jpg"); setHasChanges(false); setErrors({}); }}
                >
                  Cancel
                </Button>
              </div>

              <div className="mt-6 rounded-field border border-line bg-surface-muted p-4">
                <p className="flex items-start gap-2 text-sm font-medium text-ink-muted">
                  <Check size={17} aria-hidden className="mt-0.5 shrink-0 text-state-success" />
                  <span>
                    Your information is secure and encrypted with industry-standard protocols.
                  </span>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ── Rider Application Modal ── */}
      {showRiderForm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Rider application">
          <div className="absolute inset-0 bg-brand-navy/50 backdrop-blur-sm" onClick={() => !riderSubmitting && setShowRiderForm(false)} aria-hidden />
          <div className="relative w-full max-w-lg overflow-hidden rounded-sheet bg-surface shadow-sheet">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-brand-navy">Become a Delivery Rider</h3>
                <p className="text-xs text-ink-muted">Fill in your details to apply</p>
              </div>
              <button
                type="button"
                onClick={() => !riderSubmitting && setShowRiderForm(false)}
                aria-label="Close rider application"
                className="flex h-10 w-10 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-muted hover:text-brand-navy"
              >
                <X size={20} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                {/* Full Name */}
                <div>
                  <label
                    htmlFor="rider-fullName"
                    className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-navy"
                  >
                    Full Name *
                  </label>
                  <input
                    id="rider-fullName"
                    type="text"
                    value={riderForm.fullName}
                    onChange={(e) => setRiderForm({ ...riderForm, fullName: e.target.value })}
                    aria-invalid={Boolean(riderFormErrors.fullName) || undefined}
                    className={`h-11 w-full rounded-field border bg-surface px-4 text-sm font-medium text-brand-navy outline-none transition-[border-color,box-shadow] focus:ring-4 ${
                      riderFormErrors.fullName
                        ? "border-state-danger/60 focus:border-state-danger focus:ring-state-danger/15"
                        : "border-line focus:border-brand-gold focus:ring-brand-gold/15"
                    }`}
                    placeholder="As it appears on your CNIC"
                  />
                  {/* These errors were already collected by the submit handler
                      but never rendered — the button appeared to do nothing. */}
                  {riderFormErrors.fullName && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-state-danger">
                      {riderFormErrors.fullName}
                    </p>
                  )}
                </div>
                {/* Phone */}
                <div>
                  <label
                    htmlFor="rider-phone"
                    className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-navy"
                  >
                    Phone Number *
                  </label>
                  <input
                    id="rider-phone"
                    type="tel"
                    value={riderForm.phoneNo}
                    onChange={(e) => setRiderForm({ ...riderForm, phoneNo: e.target.value })}
                    aria-invalid={Boolean(riderFormErrors.phoneNo) || undefined}
                    className={`h-11 w-full rounded-field border bg-surface px-4 text-sm font-medium text-brand-navy outline-none transition-[border-color,box-shadow] focus:ring-4 ${
                      riderFormErrors.phoneNo
                        ? "border-state-danger/60 focus:border-state-danger focus:ring-state-danger/15"
                        : "border-line focus:border-brand-gold focus:ring-brand-gold/15"
                    }`}
                    placeholder="03XXXXXXXXX"
                  />
                  {riderFormErrors.phoneNo && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-state-danger">
                      {riderFormErrors.phoneNo}
                    </p>
                  )}
                </div>
                {/* Vehicle Type */}
                <div>
                  <label
                    htmlFor="rider-vehicle"
                    className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-navy"
                  >
                    Vehicle Type *
                  </label>
                  <select
                    id="rider-vehicle"
                    value={riderForm.vehicleType}
                    onChange={(e) => setRiderForm({ ...riderForm, vehicleType: e.target.value })}
                    aria-invalid={Boolean(riderFormErrors.vehicleType) || undefined}
                    className={`h-11 w-full rounded-field border bg-surface px-4 text-sm font-medium text-brand-navy outline-none transition-[border-color,box-shadow] focus:ring-4 ${
                      riderFormErrors.vehicleType
                        ? "border-state-danger/60 focus:border-state-danger focus:ring-state-danger/15"
                        : "border-line focus:border-brand-gold focus:ring-brand-gold/15"
                    }`}
                  >
                    <option value="">Select vehicle...</option>
                    <option value="bike">Motorcycle / Bike</option>
                    <option value="car">Car</option>
                    <option value="scooter">Scooter</option>
                    <option value="other">Other</option>
                  </select>
                  {riderFormErrors.vehicleType && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-state-danger">
                      {riderFormErrors.vehicleType}
                    </p>
                  )}
                </div>
                {/* CNIC */}
                <div>
                  <label
                    htmlFor="rider-cnic"
                    className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-navy"
                  >
                    CNIC Number *
                  </label>
                  <input
                    id="rider-cnic"
                    type="text"
                    value={riderForm.cnic}
                    onChange={(e) => setRiderForm({ ...riderForm, cnic: e.target.value })}
                    aria-invalid={Boolean(riderFormErrors.cnic) || undefined}
                    className={`h-11 w-full rounded-field border bg-surface px-4 text-sm font-medium text-brand-navy outline-none transition-[border-color,box-shadow] focus:ring-4 ${
                      riderFormErrors.cnic
                        ? "border-state-danger/60 focus:border-state-danger focus:ring-state-danger/15"
                        : "border-line focus:border-brand-gold focus:ring-brand-gold/15"
                    }`}
                    placeholder="XXXXX-XXXXXXX-X"
                  />
                  {riderFormErrors.cnic && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-state-danger">
                      {riderFormErrors.cnic}
                    </p>
                  )}
                </div>
                {/* License Plate */}
                <div>
                  <label
                    htmlFor="rider-plate"
                    className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-navy"
                  >
                    Vehicle Registration / License Plate *
                  </label>
                  <input
                    id="rider-plate"
                    type="text"
                    value={riderForm.licensePlate}
                    onChange={(e) => setRiderForm({ ...riderForm, licensePlate: e.target.value })}
                    aria-invalid={Boolean(riderFormErrors.licensePlate) || undefined}
                    className={`h-11 w-full rounded-field border bg-surface px-4 text-sm font-medium text-brand-navy outline-none transition-[border-color,box-shadow] focus:ring-4 ${
                      riderFormErrors.licensePlate
                        ? "border-state-danger/60 focus:border-state-danger focus:ring-state-danger/15"
                        : "border-line focus:border-brand-gold focus:ring-brand-gold/15"
                    }`}
                    placeholder="e.g. ABC-1234"
                  />
                  {riderFormErrors.licensePlate && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-state-danger">
                      {riderFormErrors.licensePlate}
                    </p>
                  )}
                </div>
                {/* File uploads */}
                <div>
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-navy">
                    ID Document Photo
                  </span>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-field border-2 border-dashed border-line bg-surface-muted px-4 py-3 text-sm font-medium text-ink-muted transition-colors hover:border-brand-gold hover:text-brand-gold-hover focus-within:ring-2 focus-within:ring-brand-gold">
                    <FileText size={16} aria-hidden />
                    <span className="min-w-0 truncate">
                      {riderIdFile ? riderIdFile.name : "Upload CNIC front image"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setRiderIdFile(f);
                      }}
                    />
                  </label>
                </div>
                <div>
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-navy">
                    Vehicle Registration Photo
                  </span>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-field border-2 border-dashed border-line bg-surface-muted px-4 py-3 text-sm font-medium text-ink-muted transition-colors hover:border-brand-gold hover:text-brand-gold-hover focus-within:ring-2 focus-within:ring-brand-gold">
                    <FileText size={16} aria-hidden />
                    <span className="min-w-0 truncate">
                      {riderLicenseFile ? riderLicenseFile.name : "Upload registration book image"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setRiderLicenseFile(f);
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="border-t border-line px-6 py-4">
              <button
                onClick={async () => {
                  // Validate
                  const errs: Record<string, string> = {};
                  if (!riderForm.fullName.trim()) errs.fullName = "Required";
                  if (!riderForm.phoneNo.trim()) errs.phoneNo = "Required";
                  if (!riderForm.vehicleType) errs.vehicleType = "Required";
                  if (!riderForm.cnic.trim()) errs.cnic = "Required";
                  if (!riderForm.licensePlate.trim()) errs.licensePlate = "Required";
                  if (Object.keys(errs).length > 0) {
                    setRiderFormErrors(errs);
                    return;
                  }
                  setRiderFormErrors({});
                  setRiderSubmitting(true);
                  try {
                    const fd = new FormData();
                    fd.append("fullName", riderForm.fullName.trim());
                    fd.append("phoneNo", riderForm.phoneNo.trim());
                    fd.append("vehicleType", riderForm.vehicleType);
                    fd.append("cnic", riderForm.cnic.trim());
                    fd.append("licensePlate", riderForm.licensePlate.trim());
                    if (riderIdFile) fd.append("idDocument", riderIdFile);
                    if (riderLicenseFile) fd.append("licenseDocument", riderLicenseFile);
                    await axios.post(`${baseUrl}rider/apply`, fd, {
                      withCredentials: true,
                      headers: { "Content-Type": "multipart/form-data" },
                    });
                    setRiderStatus("pending");
                    setShowRiderForm(false);
                    showToast("Application submitted! We will review it shortly.", "success");
                  } catch (err: any) {
                    showToast(err?.response?.data?.message || "Failed to submit application", "error");
                  } finally {
                    setRiderSubmitting(false);
                  }
                }}
                disabled={riderSubmitting}
                className="w-full rounded-field bg-brand-navy px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-navy-soft disabled:opacity-50"
              >
                {riderSubmitting ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  "Submit Application"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
