"use client";

import React, { useEffect, useRef, useState } from "react";
import useFetch, { baseUrl, showToast, cloudinaryUrl } from "@/app/utils/commonFunctions";
import {
  Trash2,
  Plus,
  X,
  Upload,
  AlertCircle,
  Image as ImageIcon,
  GripVertical,
  Eye,
  EyeOff,
} from "lucide-react";
import axios from "axios";
import Image from "next/image";
import { compressImage, formatFileSize } from "@/app/utils/compressImage";

/* ── Upload guards ────────────────────────────────────────────────
   Banner artwork is full-width and usually far larger than a product
   photo. The backend caps uploads at 4MB per file and Vercel rejects any
   request body over ~4.5MB with a 413 that carries NO CORS headers — the
   browser then reports it as a bare network/CORS failure. Compressing and
   size-checking client-side (exactly like product images) keeps every
   banner upload inside the limits and turns an opaque failure into a clear
   message. */
const MAX_BANNER_UPLOAD_BYTES = 4 * 1024 * 1024; // mirror of the backend multer limit
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/gif", "image/bmp", "image/avif", "image/heic", "image/heif",
];
const ACCEPTED_IMAGE_EXT = /\.(jpe?g|jfif|png|webp|gif|bmp|avif|heic|heif|tiff|tif)$/i;
const isAcceptedImage = (file: File) =>
  ACCEPTED_IMAGE_TYPES.includes(file.type) || ACCEPTED_IMAGE_EXT.test(file.name);

/** Release a local preview object URL (never touches remote Cloudinary URLs). */
const revokeBlobUrl = (url?: string | null) => {
  if (url && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* already released */
    }
  }
};

interface Category {
  _id: string;
  name: string;
  slug: string;
}

interface HomepageBanner {
  _id: string;
  type: "carousel" | "categoryBanner" | "brandBanner";
  image: string;
  imagePublicId: string;
  title?: string;
  subtitle?: string;
  tag?: string;
  link?: string;
  categoryRef?: { _id: string; name: string; slug: string } | null;
  order: number;
  isActive: boolean;
  createdAt: string;
}

type TabType = "carousel" | "categoryBanner" | "brandBanner";

const HomepageBannersPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>("carousel");

  const { data: categoriesRes } = useFetch<any>(
    `${baseUrl}category/getAllCategories`,
  );
  const { data: bannersRes, loading, reFetch } = useFetch<any>(
    `${baseUrl}homepage-banners/admin`,
  );

  const [banners, setBanners] = useState<HomepageBanner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Drag state
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  // Form state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    subtitle: "",
    tag: "",
    link: "",
    categoryRef: "",
    order: "",
    isActive: true,
  });

  // Load categories
  useEffect(() => {
    if (categoriesRes?.data) {
      let arr: Category[] = [];
      if (Array.isArray(categoriesRes.data)) {
        arr = categoriesRes.data;
      }
      setCategories(arr);
    }
  }, [categoriesRes]);

  // Load banners
  useEffect(() => {
    if (bannersRes?.data) {
      let arr: HomepageBanner[] = [];
      if (Array.isArray(bannersRes.data)) {
        arr = bannersRes.data;
      }
      setBanners(arr);
    }
  }, [bannersRes]);

  const filteredBanners = banners
    .filter((b) => b.type === activeTab)
    .sort((a, b) => a.order - b.order);

  const brandBanner = banners.find((b) => b.type === "brandBanner");

  // ── Drag and Drop Handlers ──
  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = async () => {
    const from = dragItem.current;
    const to = dragOverItem.current;
    dragItem.current = null;
    dragOverItem.current = null;

    if (from === null || to === null || from === to) return;

    const items = [...filteredBanners];
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);

    // Reassign order values based on new positions
    const reordered = items.map((item, idx) => ({
      ...item,
      order: idx,
    }));

    // Update local state
    setBanners((prev) => {
      const updated = prev.map((b) => {
        const found = reordered.find((r) => r._id === b._id);
        return found || b;
      });
      return updated;
    });

    // Persist reorder
    try {
      await axios.patch(
        `${baseUrl}homepage-banners/reorder`,
        {
          items: reordered.map((b) => ({ id: b._id, order: b.order })),
        },
        { withCredentials: true },
      );
    } catch {
      showToast("Failed to reorder", "error");
      reFetch();
    }
  };

  const handleOpenNew = () => {
    setIsEditMode(false);
    setEditingId(null);
    revokeBlobUrl(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setFormData({
      title: "",
      subtitle: "",
      tag: "",
      link: "",
      categoryRef: "",
      order: String(filteredBanners.length),
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleEdit = (banner: HomepageBanner) => {
    setIsEditMode(true);
    setEditingId(banner._id);
    revokeBlobUrl(imagePreview);
    setImagePreview(banner.image);
    setImageFile(null);
    setFormData({
      title: banner.title || "",
      subtitle: banner.subtitle || "",
      tag: banner.tag || "",
      link: banner.link || "",
      categoryRef: banner.categoryRef?._id || "",
      order: String(banner.order),
      isActive: banner.isActive,
    });
    setIsModalOpen(true);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again still fires change.
    e.target.value = "";
    if (!file) return;

    if (!isAcceptedImage(file)) {
      showToast("Unsupported file — use JPG, PNG, WebP, GIF or AVIF", "error");
      return;
    }

    setIsCompressing(true);
    try {
      // Same normalization product images get: bounded dimensions + JPEG
      // re-encode, so the request body always stays under the platform limit.
      const result = await compressImage(file, 0);
      const processed = result.compressed ? result.file : file;

      if (processed.size > MAX_BANNER_UPLOAD_BYTES) {
        showToast(
          `Image is too large (${formatFileSize(processed.size)}). Please use an image under ${(
            MAX_BANNER_UPLOAD_BYTES /
            (1024 * 1024)
          ).toFixed(0)} MB.`,
          "error",
        );
        return;
      }

      revokeBlobUrl(imagePreview);
      setImageFile(processed);
      setImagePreview(URL.createObjectURL(processed));

      if (result.compressed) {
        showToast(
          `Image optimised: ${formatFileSize(result.originalSize)} → ${formatFileSize(
            result.compressedSize,
          )}`,
          "info",
        );
      }
    } catch {
      showToast("Could not process this image — please try another file", "error");
    } finally {
      setIsCompressing(false);
    }
  };

  /** Close the create/edit modal and release any local preview URL. */
  const closeModal = () => {
    revokeBlobUrl(imagePreview);
    setIsModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEditMode && !imageFile) {
      showToast("An image is required", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const submitData = new FormData();
      submitData.append("type", activeTab);
      submitData.append("title", formData.title);
      submitData.append("subtitle", formData.subtitle);
      submitData.append("tag", formData.tag);
      submitData.append("link", formData.link);
      submitData.append("order", formData.order || String(filteredBanners.length));
      submitData.append("isActive", String(formData.isActive));

      if ((activeTab === "categoryBanner" || activeTab === "brandBanner") && formData.categoryRef) {
        submitData.append("categoryRef", formData.categoryRef);
      }

      if (imageFile) {
        submitData.append("image", imageFile);
      }

      const config = {
        withCredentials: true,
      };

      if (isEditMode && editingId) {
        const response = await axios.put(
          `${baseUrl}homepage-banners/${editingId}`,
          submitData,
          config,
        );
        if (response.data?.data) {
          setBanners((prev) =>
            prev.map((b) =>
              b._id === editingId ? response.data.data : b,
            ),
          );
          showToast("Banner updated successfully", "success");
        }
      } else {
        const response = await axios.post(
          `${baseUrl}homepage-banners`,
          submitData,
          config,
        );
        if (response.data?.data) {
          setBanners((prev) => [...prev, response.data.data]);
          showToast("Banner created successfully", "success");
        }
      }

      closeModal();
    } catch (error: any) {
      // Prefer the real backend message. A failure without any response means
      // the request never reached Express (platform 413 / network / CORS) —
      // surface that instead of an unhelpful generic message.
      const msg =
        error?.response?.data?.message ||
        (error?.response
          ? "Failed to save banner"
          : "Upload failed — the image may be too large for the server. Try a smaller image.");
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsSubmitting(true);
    try {
      await axios.delete(`${baseUrl}homepage-banners/${deleteId}`, {
        withCredentials: true,
      });
      setBanners((prev) => prev.filter((b) => b._id !== deleteId));
      showToast("Banner deleted successfully", "success");
      setDeleteId(null);
    } catch (error: any) {
      const msg = error.response?.data?.message || "Failed to delete";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (banner: HomepageBanner) => {
    try {
      const submitData = new FormData();
      submitData.append("isActive", String(!banner.isActive));

      const response = await axios.put(
        `${baseUrl}homepage-banners/${banner._id}`,
        submitData,
        { withCredentials: true },
      );

      if (response.data?.data) {
        setBanners((prev) =>
          prev.map((b) =>
            b._id === banner._id ? response.data.data : b,
          ),
        );
      }
    } catch (error: any) {
      showToast("Failed to toggle status", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Homepage Banners
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage carousel slides and category banner images
          </p>
        </div>
        <button
          onClick={handleOpenNew}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0856DF] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8]"
        >
          <Plus className="h-4 w-4" /> New{" "}
          {activeTab === "carousel"
            ? "Slide"
            : activeTab === "brandBanner"
              ? "Brand Banner"
              : "Banner"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setActiveTab("carousel")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "carousel"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Carousel ({banners.filter((b) => b.type === "carousel").length})
        </button>
        <button
          onClick={() => setActiveTab("categoryBanner")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "categoryBanner"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Category ({banners.filter((b) => b.type === "categoryBanner").length})
        </button>
        <button
          onClick={() => setActiveTab("brandBanner")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "brandBanner"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Brand ({banners.filter((b) => b.type === "brandBanner").length})
        </button>
      </div>

      {/* ── Brand Banner Section ── */}
      {activeTab === "brandBanner" && (
        <div>
          {brandBanner ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6 md:flex-row md:items-start">
                {/* Preview */}
                <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 md:w-80">
                  <Image
                    src={brandBanner.image}
                    alt={brandBanner.title || "Brand Banner"}
                    fill
                    style={{ objectFit: "cover" }}
                    priority
                  />
                </div>

                {/* Info */}
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900">
                    {brandBanner.title || "Brand Banner"}
                  </h3>
                  {brandBanner.subtitle && (
                    <p className="mt-1 text-sm text-slate-500">
                      {brandBanner.subtitle}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      brandBanner.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${brandBanner.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      {brandBanner.isActive ? "Active" : "Inactive"}
                    </span>
                    <button
                      onClick={() => handleToggleActive(brandBanner)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      {brandBanner.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={() => handleEdit(brandBanner)}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#0856DF] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8]"
                    >
                      <Upload size={15} /> Replace Image
                    </button>
                    <button
                      onClick={() => setDeleteId(brandBanner._id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-600 hover:text-white"
                    >
                      <Trash2 size={15} /> Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <ImageIcon size={24} className="text-slate-400" />
              </div>
              <p className="font-medium text-slate-600">No brand banner set</p>
              <p className="mt-1 text-sm text-slate-400">
                Upload a brand banner image to appear on the homepage
              </p>
              <button
                onClick={handleOpenNew}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0856DF] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8]"
              >
                <Plus className="h-4 w-4" /> Add Brand Banner
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Carousel & Category Banner List (with Drag & Drop) ── */}
      {activeTab !== "brandBanner" && (
        <div className="space-y-2">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <p className="font-medium text-slate-500">Loading banners...</p>
            </div>
          ) : filteredBanners.length > 0 ? (
            filteredBanners.map((banner, index) => (
              <div
                key={banner._id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className={`flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 ${
                  !banner.isActive ? "opacity-60" : ""
                } hover:border-[#0856DF]/30 hover:shadow-md cursor-grab active:cursor-grabbing active:shadow-lg active:scale-[1.02]`}
              >
                {/* Drag handle */}
                <div className="flex shrink-0 cursor-grab items-center text-slate-300 hover:text-slate-500">
                  <GripVertical size={18} />
                </div>

                {/* Thumbnail */}
                <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  {banner.image ? (
                    <Image
                      src={cloudinaryUrl(banner.image, 200)}
                      alt={banner.title || "Banner"}
                      fill
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon size={20} className="text-slate-400" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {banner.title || "(no title)"}
                  </p>
                  {banner.subtitle && (
                    <p className="truncate text-xs text-slate-500">
                      {banner.subtitle}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {banner.categoryRef && (
                      <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {banner.categoryRef.name}
                      </span>
                    )}
                    {!banner.isActive && (
                      <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Inactive
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      #{banner.order + 1}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(banner)}
                    className={`rounded-lg border p-2 transition ${
                      banner.isActive
                        ? "border-green-200 bg-green-50 text-green-600 hover:bg-green-600 hover:text-white"
                        : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-200"
                    }`}
                    aria-label={banner.isActive ? "Deactivate" : "Activate"}
                  >
                    {banner.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    onClick={() => handleEdit(banner)}
                    className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-600 transition hover:bg-blue-600 hover:text-white"
                    aria-label="Edit"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <button
                    onClick={() => setDeleteId(banner._id)}
                    className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 transition hover:bg-red-600 hover:text-white"
                    aria-label="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <ImageIcon size={24} className="text-slate-400" />
              </div>
              <p className="font-medium text-slate-600">
                No {activeTab === "carousel" ? "carousel slides" : "category banners"} yet
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Click "New {activeTab === "carousel" ? "Slide" : "Banner"}" to add one
              </p>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">
                {isEditMode ? "Edit" : "New"}{" "}
                {activeTab === "carousel" ? "Carousel Slide" : "Category Banner"}
              </h3>
              <button
                onClick={closeModal}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-6 py-5">
              {/* Image Upload */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Banner Image {!isEditMode && "(required)"}
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="text-slate-400" size={32} />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      id="image-upload"
                      className="hidden"
                      onChange={handleImageChange}
                      disabled={isSubmitting || isCompressing}
                    />
                    <label
                      htmlFor="image-upload"
                      className={`inline-block w-full cursor-pointer rounded-xl border border-slate-300 bg-white py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50 ${
                        isSubmitting || isCompressing ? "cursor-not-allowed opacity-60" : ""
                      }`}
                    >
                      {isCompressing
                        ? "Optimising…"
                        : isEditMode
                          ? "Replace Image"
                          : "Choose Image"}
                    </label>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      JPG, PNG, WebP, GIF or AVIF — large images are optimised automatically.
                    </p>
                  </div>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                  placeholder={activeTab === "carousel" ? "e.g. Premium Accessories" : "e.g. Azaadi Collection"}
                  disabled={isSubmitting}
                />
              </div>

              {/* Subtitle (carousel & brandBanner) */}
              {(activeTab === "carousel" || activeTab === "brandBanner") && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Subtitle
                  </label>
                  <textarea
                    value={formData.subtitle}
                    onChange={(e) =>
                      setFormData({ ...formData, subtitle: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15 resize-none"
                    rows={2}
                    placeholder="Elevate your style with our latest curated collection"
                    disabled={isSubmitting}
                  />
                </div>
              )}

              {/* Tag (carousel only) */}
              {activeTab === "carousel" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Tag / Badge
                  </label>
                  <input
                    type="text"
                    value={formData.tag}
                    onChange={(e) =>
                      setFormData({ ...formData, tag: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                    placeholder="e.g. New Collection, Trending Now"
                    disabled={isSubmitting}
                  />
                </div>
              )}

              {/* Category Reference (categoryBanner only) */}
              {activeTab === "categoryBanner" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Linked Category
                  </label>
                  <select
                    value={formData.categoryRef}
                    onChange={(e) =>
                      setFormData({ ...formData, categoryRef: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                    disabled={isSubmitting}
                  >
                    <option value="">-- None (display only) --</option>
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat._id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Link */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Link URL (optional)
                </label>
                <input
                  type="text"
                  value={formData.link}
                  onChange={(e) =>
                    setFormData({ ...formData, link: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                  placeholder="/productsPage?category=..."
                  disabled={isSubmitting}
                />
              </div>

              {/* Order & Active Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={formData.order}
                    onChange={(e) =>
                      setFormData({ ...formData, order: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Status
                  </label>
                  <div className="flex h-full items-center gap-3 pt-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) =>
                          setFormData({ ...formData, isActive: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]"
                        disabled={isSubmitting}
                      />
                      <span className="text-sm font-medium text-slate-700">
                        Active
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#0856DF] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8] disabled:opacity-50"
                  disabled={isSubmitting || isCompressing}
                >
                  {isSubmitting
                    ? "Saving..."
                    : isEditMode
                      ? "Update"
                      : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <AlertCircle size={26} className="text-red-600" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-slate-900">Delete Banner?</h3>
            <p className="mb-6 text-sm font-medium text-slate-500">
              This will permanently delete this banner and its image from Cloudinary.
              <br />
              <span className="text-xs text-slate-400">This action cannot be undone.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isSubmitting}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomepageBannersPage;
