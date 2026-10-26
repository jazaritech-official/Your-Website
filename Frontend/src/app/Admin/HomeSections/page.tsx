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
  Layers,
} from "lucide-react";
import axios from "axios";
import Image from "next/image";

interface Subcategory {
  _id: string;
  name: string;
  slug: string;
}

interface Category {
  _id: string;
  name: string;
  slug: string;
  subcategories?: Subcategory[];
}

interface HomeSection {
  _id: string;
  image: string;
  imagePublicId: string;
  category?: { _id: string; name: string; slug: string } | null;
  subcategory?: { _id: string; name: string; slug: string } | null;
  order: number;
  isActive: boolean;
  createdAt: string;
}

const HomeSectionsPage = () => {
  const { data: categoriesRes } = useFetch<any>(
    `${baseUrl}category/getAllCategories`,
  );
  const { data: sectionsRes, loading, reFetch } = useFetch<any>(
    `${baseUrl}home-sections/admin`,
  );

  const [sections, setSections] = useState<HomeSection[]>([]);
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

  // Form state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    category: "",
    subcategory: "",
    order: "",
    isActive: true,
  });

  // Load categories (with subcategories populated by getAllCategories)
  useEffect(() => {
    if (categoriesRes?.data) {
      let arr: Category[] = [];
      if (Array.isArray(categoriesRes.data)) {
        arr = categoriesRes.data;
      }
      setCategories(arr);
    }
  }, [categoriesRes]);

  // Load sections
  useEffect(() => {
    if (sectionsRes?.data) {
      let arr: HomeSection[] = [];
      if (Array.isArray(sectionsRes.data)) {
        arr = sectionsRes.data;
      }
      setSections(arr);
    }
  }, [sectionsRes]);

  const orderedSections = [...sections].sort((a, b) => a.order - b.order);

  // Subcategories of the currently selected category (empty when the
  // category has none, or when no category is selected yet)
  const selectedCategory = categories.find((c) => c._id === formData.category);
  const subcategories = selectedCategory?.subcategories || [];

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

    const items = [...orderedSections];
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);

    // Reassign order values based on new positions
    const reordered = items.map((item, idx) => ({
      ...item,
      order: idx,
    }));

    setSections(reordered);

    // Persist reorder
    try {
      await axios.patch(
        `${baseUrl}home-sections/reorder`,
        {
          items: reordered.map((s) => ({ id: s._id, order: s.order })),
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
    setImageFile(null);
    setImagePreview(null);
    setFormData({
      category: "",
      subcategory: "",
      order: String(orderedSections.length),
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleEdit = (section: HomeSection) => {
    setIsEditMode(true);
    setEditingId(section._id);
    setImagePreview(section.image);
    setImageFile(null);
    setFormData({
      category: section.category?._id || "",
      subcategory: section.subcategory?._id || "",
      order: String(section.order),
      isActive: section.isActive,
    });
    setIsModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.category) {
      showToast("Please select a category", "error");
      return;
    }
    if (!isEditMode && !imageFile) {
      showToast("A banner image is required", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const submitData = new FormData();
      submitData.append("category", formData.category);
      submitData.append("subcategory", formData.subcategory);
      submitData.append("order", formData.order || String(orderedSections.length));
      submitData.append("isActive", String(formData.isActive));

      if (imageFile) {
        submitData.append("image", imageFile);
      }

      const config = { withCredentials: true };

      if (isEditMode && editingId) {
        const response = await axios.put(
          `${baseUrl}home-sections/${editingId}`,
          submitData,
          config,
        );
        if (response.data?.data) {
          setSections((prev) =>
            prev.map((s) => (s._id === editingId ? response.data.data : s)),
          );
          showToast("Home section updated successfully", "success");
        }
      } else {
        const response = await axios.post(
          `${baseUrl}home-sections`,
          submitData,
          config,
        );
        if (response.data?.data) {
          setSections((prev) => [...prev, response.data.data]);
          showToast("Home section created successfully", "success");
        }
      }

      setIsModalOpen(false);
    } catch (error: any) {
      const msg = error.response?.data?.message || "Failed to save home section";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsSubmitting(true);
    try {
      await axios.delete(`${baseUrl}home-sections/${deleteId}`, {
        withCredentials: true,
      });
      setSections((prev) => prev.filter((s) => s._id !== deleteId));
      showToast("Home section deleted successfully", "success");
      setDeleteId(null);
    } catch (error: any) {
      const msg = error.response?.data?.message || "Failed to delete";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (section: HomeSection) => {
    try {
      const submitData = new FormData();
      submitData.append("isActive", String(!section.isActive));

      const response = await axios.put(
        `${baseUrl}home-sections/${section._id}`,
        submitData,
        { withCredentials: true },
      );

      if (response.data?.data) {
        setSections((prev) =>
          prev.map((s) => (s._id === section._id ? response.data.data : s)),
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
            Home Sections
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Build homepage sections: a banner image followed by that category&apos;s
            products
          </p>
        </div>
        <button
          onClick={handleOpenNew}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0856DF] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8]"
        >
          <Plus className="h-4 w-4" /> New Section
        </button>
      </div>

      {/* Section List */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="font-medium text-slate-500">Loading sections...</p>
        </div>
      ) : orderedSections.length > 0 ? (
        <div className="space-y-2">
          {orderedSections.map((section, index) => (
            <div
              key={section._id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={`flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 ${
                !section.isActive ? "opacity-60" : ""
              } hover:border-[#0856DF]/30 hover:shadow-md cursor-grab active:cursor-grabbing active:shadow-lg active:scale-[1.02]`}
            >
              {/* Drag handle */}
              <div className="flex shrink-0 cursor-grab items-center text-slate-300 hover:text-slate-500">
                <GripVertical size={18} />
              </div>

              {/* Banner thumbnail */}
              <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {section.image ? (
                  <Image
                    src={cloudinaryUrl(section.image, 200)}
                    alt={`Banner for ${section.category?.name || "category"}`}
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
                  {section.category?.name || "(no category)"}
                  {section.subcategory?.name
                    ? ` / ${section.subcategory.name}`
                    : ""}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {section.category && (
                    <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {section.category.name}
                    </span>
                  )}
                  {section.subcategory && (
                    <span className="inline-block rounded-md bg-[#0856DF]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0856DF]">
                      {section.subcategory.name}
                    </span>
                  )}
                  {!section.isActive && (
                    <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Inactive
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400">
                    #{section.order + 1}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => handleToggleActive(section)}
                  className={`rounded-lg border p-2 transition ${
                    section.isActive
                      ? "border-green-200 bg-green-50 text-green-600 hover:bg-green-600 hover:text-white"
                      : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-200"
                  }`}
                  aria-label={section.isActive ? "Deactivate" : "Activate"}
                >
                  {section.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button
                  onClick={() => handleEdit(section)}
                  className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-600 transition hover:bg-blue-600 hover:text-white"
                  aria-label="Edit"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button
                  onClick={() => setDeleteId(section._id)}
                  className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 transition hover:bg-red-600 hover:text-white"
                  aria-label="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Layers size={24} className="text-slate-400" />
          </div>
          <p className="font-medium text-slate-600">No home sections yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Click &quot;New Section&quot; to add a banner + category section
          </p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">
                {isEditMode ? "Edit" : "New"} Home Section
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-6 py-5">
              {/* Banner Image Upload */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Banner Image {!isEditMode && "(required)"}
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
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
                      disabled={isSubmitting}
                    />
                    <label
                      htmlFor="image-upload"
                      className="inline-block w-full cursor-pointer rounded-xl border border-slate-300 bg-white py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      {isEditMode ? "Replace Image" : "Choose Image"}
                    </label>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Full-width banner — recommend a wide image (e.g. 1920×600)
                    </p>
                  </div>
                </div>
              </div>

              {/* Category Picker */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      category: e.target.value,
                      // Reset subcategory when the category changes — the
                      // previous subcategory may not belong to the new category.
                      subcategory: "",
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                  disabled={isSubmitting}
                >
                  <option value="">-- Select a category --</option>
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subcategory Picker (only when the selected category has subcategories) */}
              {subcategories.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Subcategory (optional)
                  </label>
                  <select
                    value={formData.subcategory}
                    onChange={(e) =>
                      setFormData({ ...formData, subcategory: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                    disabled={isSubmitting}
                  >
                    <option value="">-- All products in {selectedCategory?.name || "category"} --</option>
                    {subcategories.map((sub) => (
                      <option key={sub._id} value={sub._id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Leave blank to show all products in this category
                  </p>
                </div>
              )}

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
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#0856DF] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8] disabled:opacity-50"
                  disabled={isSubmitting}
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
            <h3 className="mb-2 text-lg font-bold text-slate-900">Delete Section?</h3>
            <p className="mb-6 text-sm font-medium text-slate-500">
              This will permanently delete this section and its banner image from
              Cloudinary.
              <br />
              <span className="text-xs text-slate-400">
                This action cannot be undone.
              </span>
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

export default HomeSectionsPage;