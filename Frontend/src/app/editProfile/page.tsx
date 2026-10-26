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
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/app/Redux/store";
import {
  loginRequest,
  loginSuccess,
  loginFailure,
} from "@/app/Redux/Features/authSlice";
import useFetch, { baseUrl, showToast } from "@/app/utils/commonFunctions";
import Link from "next/link";
import ProfileNav from "@/app/Components/ProfileNav";
import {
  Button,
  EmptyState,
  SectionLabel,
  buttonStyles,
} from "@/app/Components/ui";

const EditProfile = () => {
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

  // Form state
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

  const { data: apiResponse } = useFetch<any>(
    auth.username ? `${baseUrl}auth/getUser/${auth.username}` : "",
  );

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

    // Clear error for this field when user starts typing
    if (errors[name as keyof typeof errors]) {
      setErrors({
        ...errors,
        [name]: undefined,
      });
    }
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const img = e.target.files?.[0];
    if (img) {
      // Validate file size (max 5MB)
      if (img.size > 5 * 1024 * 1024) {
        showToast("Image size must be less than 5MB", "error");
        return;
      }

      // Validate file type
      if (
        !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
          img.type,
        )
      ) {
        showToast(
          "Please upload a valid image file (JPEG, PNG, GIF, WebP)",
          "error",
        );
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

      dispatch(
        loginSuccess({
          ...res.data.data,
          isAdmin: res.data.data?.isAdmin ?? false,
        }),
      );
      showToast("Profile updated successfully!", "success");

      // Update original form
      setOriginalForm(form);
      setFile(null);
      setHasChanges(false);
    } catch (err: any) {
      dispatch(loginFailure("Update failed"));
      showToast(
        err.response?.data?.message || "Failed to update profile",
        "error",
      );
    }
  };

  if (!isMounted) return null;

  // Same inline route guard the other account pages use — this page previously
  // rendered an empty form with every control disabled for logged-out visitors.
  if (!auth.username) {
    return (
      <main className="min-h-screen bg-surface-page px-4 pb-16 pt-8">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={<User size={26} />}
            title="Sign in to edit your profile"
            description="You need an account before you can change your details."
            action={
              <Link href="/" className={buttonStyles({ variant: "gold", size: "md" })}>
                Back to Home
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-surface-page px-4 pb-16 pt-8 font-sans">
      <div className="mx-auto max-w-3xl ir-fade-in-up">
        {/* Header Section */}
        <header className="mb-5">
          <SectionLabel>Your account</SectionLabel>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-brand-navy sm:text-4xl">
            Edit Profile
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Keep your information up to date — it is used for deliveries and order updates.
          </p>
        </header>

        <ProfileNav />

        {/* Main Card */}
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {/* Top Accent Bar */}
          <div className="h-1 bg-gradient-to-r from-brand-gold via-brand-gold/40 to-transparent" />

          <div className="p-6 sm:p-8 md:p-10">
            {/* Avatar Section */}
            <div className="mb-10 flex flex-col items-center">
              <label className="group relative mb-4 cursor-pointer">
                <div className="relative h-32 w-32 overflow-hidden rounded-card bg-surface-muted ring-4 ring-line transition-shadow duration-300 group-hover:ring-brand-gold/40 sm:h-40 sm:w-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Profile photo"
                    className="h-full w-full object-cover"
                  />
                  {/* Overlay */}
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

            {/* Form Section */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username Field */}
              <div>
                <label
                  htmlFor="edit-username"
                  className="mb-1.5 block text-[13px] font-semibold text-brand-navy"
                >
                  Username
                </label>
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle">
                    <User size={19} />
                  </span>
                  <input
                    id="edit-username"
                    type="text"
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    placeholder="Enter your username"
                    aria-invalid={Boolean(errors.username) || undefined}
                    aria-describedby={errors.username ? "edit-username-error" : undefined}
                    /* The error branch used to share the SAME border colour as the
                       valid branch, so a failed validation looked like a normal field. */
                    className={`h-12 w-full rounded-field border bg-surface pl-12 pr-4 text-[15px] font-medium text-brand-navy outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:ring-4 ${
                      errors.username
                        ? "border-state-danger/60 focus:border-state-danger focus:ring-state-danger/15"
                        : "border-line focus:border-brand-gold focus:ring-brand-gold/15"
                    }`}
                  />
                </div>
                {errors.username && (
                  <p
                    id="edit-username-error"
                    role="alert"
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-state-danger"
                  >
                    <AlertCircle size={14} aria-hidden />
                    {errors.username}
                  </p>
                )}
                <p className="mt-1 text-xs font-medium text-ink-subtle">
                  3-20 characters
                </p>
              </div>

              {/* Phone Number Field */}
              <div>
                <label
                  htmlFor="edit-phone"
                  className="mb-1.5 block text-[13px] font-semibold text-brand-navy"
                >
                  Phone Number
                </label>
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle">
                    <Phone size={19} />
                  </span>
                  <input
                    id="edit-phone"
                    type="tel"
                    name="phoneNo"
                    value={form.phoneNo}
                    onChange={handleChange}
                    placeholder="Enter phone number (10-15 digits)"
                    aria-invalid={Boolean(errors.phoneNo) || undefined}
                    aria-describedby={errors.phoneNo ? "edit-phone-error" : undefined}
                    className={`h-12 w-full rounded-field border bg-surface pl-12 pr-4 text-[15px] font-medium text-brand-navy outline-none transition-[border-color,box-shadow] placeholder:text-ink-subtle focus:ring-4 ${
                      errors.phoneNo
                        ? "border-state-danger/60 focus:border-state-danger focus:ring-state-danger/15"
                        : "border-line focus:border-brand-gold focus:ring-brand-gold/15"
                    }`}
                  />
                </div>
                {errors.phoneNo && (
                  <p
                    id="edit-phone-error"
                    role="alert"
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-state-danger"
                  >
                    <AlertCircle size={14} aria-hidden />
                    {errors.phoneNo}
                  </p>
                )}
              </div>

              {/* Address Field */}
              <div>
                <label
                  htmlFor="edit-address"
                  className="mb-1.5 block text-[13px] font-semibold text-brand-navy"
                >
                  Full Address
                </label>
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute left-4 top-3.5 text-ink-subtle">
                    <MapPin size={19} />
                  </span>
                  <textarea
                    id="edit-address"
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    placeholder="Enter your full address (street, city, country)"
                    rows={4}
                    maxLength={500}
                    aria-invalid={Boolean(errors.address) || undefined}
                    aria-describedby={errors.address ? "edit-address-error" : undefined}
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
                    id="edit-address-error"
                    role="alert"
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-state-danger"
                  >
                    <AlertCircle size={14} aria-hidden />
                    {errors.address}
                  </p>
                )}
              </div>

              {/* Button Group */}
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
                  onClick={() => {
                    setForm(originalForm);
                    setFile(null);
                    setPreview(
                      apiResponse?.data?.profilePic || "/defaultAvatar.jpg",
                    );
                    setHasChanges(false);
                    setErrors({});
                  }}
                >
                  Cancel
                </Button>
              </div>

              {/* Info Message */}
              <div className="mt-6 rounded-field border border-line bg-surface-muted p-4">
                <p className="flex items-start gap-2 text-sm font-medium text-ink-muted">
                  <Check size={17} aria-hidden className="mt-0.5 shrink-0 text-state-success" />
                  <span>
                    Your information is secure and encrypted with
                    industry-standard protocols.
                  </span>
                </p>
              </div>
            </form>
          </div>
        </div>

        {/* Footer — previously `href="#"`, which jumped to the top of the page
            instead of reaching anyone. Points at the in-app support chat. */}
        <p className="mt-6 text-center text-sm font-medium text-ink-muted">
          Need help?{" "}
          <Link href="/chat" className="font-bold text-brand-navy underline hover:text-brand-gold-hover">
            Contact Support
          </Link>
        </p>
      </div>
    </div>
  );
};

export default EditProfile;
