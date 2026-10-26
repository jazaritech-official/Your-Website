"use client";
import { formatPKR } from "@/app/utils/format";

import { useEffect, useState } from "react";
import useFetch, {
  baseUrl,
  showToast,
  invalidateCache,
  cloudinaryUrl,
} from "@/app/utils/commonFunctions";
import {
  Trash2,
  Edit,
  Plus,
  X,
  Eye,
  ChevronDown,
  FolderTree,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import axios from "axios";
import Image from "next/image";
import AiGeneratorButton from "../components/AiGeneratorButton";

interface Product {
  _id: string;
  name: string;
  price: number;
  stock: number;
}

interface Subcategory {
  _id: string;
  name: string;
  description?: string;
  slug?: string;
  image?: string;
  isActive: boolean;
  createdAt?: string;
}

interface Category {
  _id: string;
  name: string;
  description: string;
  slug: string;
  products: Product[];
  subcategories?: Subcategory[];
  isActive: boolean;
  usesSizeBasedPricing?: boolean;
  image?: { url: string; public_id: string } | string;
  createdAt: string;
  updatedAt: string;
}

const emptySubForm = {
  name: "",
  description: "",
  parentCategory: "",
  isActive: true,
};

const CategoriesPage = () => {
  const {
    data: res,
    loading,
  } = useFetch<any>(`${baseUrl}category/getAllCategories`);
  const [categories, setCategories] = useState<Category[]>([]);

  // ── Category modal state ──
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingProducts, setViewingProducts] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    slug: "",
    usesSizeBasedPricing: false,
  });

  // ── Subcategory state ──
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subEditMode, setSubEditMode] = useState(false);
  const [subEditingId, setSubEditingId] = useState<string | null>(null);
  const [subDeleteId, setSubDeleteId] = useState<string | null>(null);
  const [subForm, setSubForm] = useState({ ...emptySubForm });
  const [subImageFile, setSubImageFile] = useState<File | null>(null);
  const [subImagePreview, setSubImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (res?.data) {
      const cats = Array.isArray(res.data) ? res.data : [];
      setCategories(cats);
      // Default: expand every category so the hierarchy is visible at once.
      setExpanded((prev) => {
        const next = new Set(prev);
        cats.forEach((c: Category) => next.add(c._id));
        return next;
      });
    }
  }, [res]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isExpanded = (id: string) => expanded.has(id);

  const countSubProducts = (cat: Category, subId: string) => {
    return (cat.products || []).filter((p: any) => {
      const pid =
        typeof p.subcategory === "object"
          ? p.subcategory?._id
          : p.subcategory;
      return pid === subId;
    }).length;
  };

  const getImageUrl = (img: Category["image"] | undefined) =>
    typeof img === "object" ? img?.url : img;

  // ==========================================
  // CATEGORY CRUD (existing flow, kept intact)
  // ==========================================
  const handleOpenModal = () => {
    setIsEditMode(false);
    setEditingId(null);
    setFormData({ name: "", description: "", slug: "", usesSizeBasedPricing: false });
    setImageFile(null);
    setImagePreview(null);
    setIsModalOpen(true);
  };

  const handleEditCategory = (category: Category) => {
    setIsEditMode(true);
    setEditingId(category._id);
    setFormData({
      name: category.name,
      description: category.description,
      slug: category.slug,
      usesSizeBasedPricing: category.usesSizeBasedPricing ?? false,
    });
    setImagePreview(getImageUrl(category.image) || null);
    setImageFile(null);
    setIsModalOpen(true);
  };

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormData({ ...formData, name, slug: generateSlug(name) });
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
    if (!formData.name.trim() || !formData.description.trim()) {
      showToast("Name and description are required", "error");
      return;
    }
    if (!isEditMode && !imageFile) {
      showToast("Image is required for a new category", "error");
      return;
    }
    setIsSubmitting(true);
    const submitData = new FormData();
    submitData.append("name", formData.name);
    submitData.append("description", formData.description);
    submitData.append("slug", formData.slug);
    submitData.append("usesSizeBasedPricing", formData.usesSizeBasedPricing ? "true" : "false");
    if (imageFile) submitData.append("image", imageFile);
    try {
      const config = { withCredentials: true };
      if (isEditMode && editingId) {
        const response = await axios.put(
          `${baseUrl}category/updateCategory/${editingId}`,
          submitData,
          config,
        );
        if (response.data?.data) {
          setCategories((prev) =>
            prev.map((cat) =>
              cat._id === editingId ? response.data.data : cat,
            ),
          );
          invalidateCache("categories");
          showToast("Category updated successfully", "success");
        }
      } else {
        const response = await axios.post(
          `${baseUrl}category/addCategory`,
          submitData,
          config,
        );
        if (response.data?.data) {
          const created = response.data.data;
          setCategories((prev) => [...prev, created]);
          setExpanded((prev) => new Set(prev).add(created._id));
          invalidateCache("categories");
          showToast("Category created successfully", "success");
        }
      }
      setIsModalOpen(false);
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to save category",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsSubmitting(true);
    try {
      const response = await axios.delete(
        `${baseUrl}category/deleteCategory/${deleteId}`,
        { withCredentials: true },
      );
      if (response.data) {
        setCategories((prev) =>
          prev.filter((cat) => cat._id !== deleteId),
        );
        invalidateCache("categories");
        showToast("Category deleted successfully", "success");
      }
      setDeleteId(null);
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to delete category",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // SUBCATEGORY CRUD
  // ==========================================
  const handleAddSubcategory = (categoryId: string) => {
    setSubEditMode(false);
    setSubEditingId(null);
    setSubForm({ ...emptySubForm, parentCategory: categoryId });
    setSubImageFile(null);
    setSubImagePreview(null);
    setSubModalOpen(true);
  };

  const handleEditSubcategory = (
    category: Category,
    sub: Subcategory,
  ) => {
    setSubEditMode(true);
    setSubEditingId(sub._id);
    setSubForm({
      name: sub.name,
      description: sub.description || "",
      parentCategory: category._id,
      isActive: sub.isActive,
    });
    setSubImagePreview(sub.image || null);
    setSubImageFile(null);
    setSubModalOpen(true);
  };

  const handleSubImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSubImageFile(file);
      setSubImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subForm.name.trim()) {
      showToast("Subcategory name is required", "error");
      return;
    }
    if (!subForm.parentCategory) {
      showToast("Parent category is required", "error");
      return;
    }
    if (!subEditMode && !subImageFile) {
      showToast("Image is required for a new subcategory", "error");
      return;
    }
    setIsSubmitting(true);
    const submitData = new FormData();
    submitData.append("name", subForm.name);
    submitData.append("description", subForm.description);
    submitData.append("parentCategory", subForm.parentCategory);
    submitData.append("isActive", subForm.isActive ? "true" : "false");
    if (subImageFile) submitData.append("image", subImageFile);
    try {
      const config = { withCredentials: true };
      if (subEditMode && subEditingId) {
        const response = await axios.put(
          `${baseUrl}subcategory/updateSubcategory/${subEditingId}`,
          submitData,
          config,
        );
        if (response.data?.data) {
          // Refresh via re-fetch to keep category↔subcategory links correct.
          const catRes = await axios.get(
            `${baseUrl}category/getAllCategories`,
            { withCredentials: true },
          );
          const cats = Array.isArray(catRes.data?.data)
            ? catRes.data.data
            : [];
          if (cats.length) setCategories(cats);
          invalidateCache("categories");
          showToast("Subcategory updated successfully", "success");
        }
      } else {
        const response = await axios.post(
          `${baseUrl}subcategory/addSubcategory`,
          submitData,
          config,
        );
        if (response.data?.data) {
          const created = response.data.data;
          // Attach the created subcategory to its parent in local state, and
          // refresh counts by re-fetching the categories list.
          const catRes = await axios.get(
            `${baseUrl}category/getAllCategories`,
            { withCredentials: true },
          );
          const cats = Array.isArray(catRes.data?.data)
            ? catRes.data.data
            : [];
          if (cats.length) {
            setCategories(cats);
          } else {
            setCategories((prev) =>
              prev.map((cat) =>
                cat._id === created.parentCategory?._id || cat._id === subForm.parentCategory
                  ? {
                      ...cat,
                      subcategories: [...(cat.subcategories || []), created],
                    }
                  : cat,
              ),
            );
          }
          setExpanded((prev) =>
            new Set(prev).add(created.parentCategory?._id || subForm.parentCategory),
          );
          invalidateCache("categories");
          showToast("Subcategory created successfully", "success");
        }
      }
      setSubModalOpen(false);
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to save subcategory",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubDelete = async () => {
    if (!subDeleteId) return;
    setIsSubmitting(true);
    try {
      const response = await axios.delete(
        `${baseUrl}subcategory/deleteSubcategory/${subDeleteId}`,
        { withCredentials: true },
      );
      if (response.data) {
        setCategories((prev) =>
          prev.map((cat) => ({
            ...cat,
            subcategories: (cat.subcategories || []).filter(
              (sub) => sub._id !== subDeleteId,
            ),
          })),
        );
        invalidateCache("categories");
        showToast("Subcategory deleted successfully", "success");
      }
      setSubDeleteId(null);
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Failed to delete subcategory",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (date?: string) =>
    date
      ? new Date(date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "—";

  const statusBadge = (isActive: boolean) =>
    isActive ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Inactive
      </span>
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Categories
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage your category hierarchy — expand a category to manage its
            subcategories
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600">
            <FolderTree className="h-4 w-4 text-[#0856DF]" /> Total:{" "}
            {categories.length}
          </span>
          <button
            onClick={handleOpenModal}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0856DF] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8]"
          >
            <Plus className="h-4 w-4" /> New Category
          </button>
        </div>
      </div>

      {/* Hierarchy List */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#0856DF]" />
            <p className="text-sm font-medium text-slate-500">
              Loading categories...
            </p>
          </div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <FolderTree size={22} />
            </div>
            <p className="text-sm font-semibold text-slate-600">
              No categories found
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Create your first category to start building the hierarchy.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {categories.map((cat) => {
              const imgUrl = getImageUrl(cat.image);
              const subs = cat.subcategories || [];
              const expandedCat = isExpanded(cat._id);
              return (
                <div key={cat._id} className="group">
                  {/* Category row */}
                  <div
                    className="flex cursor-pointer items-center gap-3 px-4 py-4 transition-colors hover:bg-slate-50 sm:px-6"
                    onClick={() => toggleExpand(cat._id)}
                  >
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-slate-400 transition-transform duration-300 ${
                        expandedCat ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                      {imgUrl ? (
                        <Image
                          src={cloudinaryUrl(imgUrl, 100)}
                          alt={cat.name}
                          fill
                          style={{ objectFit: "cover" }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <ImageIcon size={20} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {cat.name}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                        <span className="line-clamp-1 max-w-[280px]">
                          {cat.description}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#0856DF]/10 px-2 py-0.5 font-semibold text-[#0856DF]">
                          {subs.length} subcategor{subs.length === 1 ? "y" : "ies"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                          {cat.products?.length || 0} products
                        </span>
                      </p>
                    </div>
                    <span className="hidden sm:inline-block">
                      {statusBadge(cat.isActive)}
                    </span>
                    <span className="hidden text-xs font-medium text-slate-400 lg:inline-block">
                      {formatDate(cat.createdAt)}
                    </span>
                    <div
                      className="flex shrink-0 items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleAddSubcategory(cat._id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#0856DF]/30 bg-[#0856DF]/5 px-2.5 py-1.5 text-xs font-semibold text-[#0856DF] transition hover:bg-[#0856DF] hover:text-white"
                        aria-label={`Add subcategory to ${cat.name}`}
                      >
                        <Plus size={13} /> Sub
                      </button>
                      <button
                        onClick={() => handleEditCategory(cat)}
                        className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-600 transition hover:bg-blue-600 hover:text-white"
                        aria-label="Edit category"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteId(cat._id)}
                        className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 transition hover:bg-red-600 hover:text-white"
                        aria-label="Delete category"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Expandable subcategory rows */}
                  <div
                    className={`grid transition-all duration-300 ease-in-out ${
                      expandedCat
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="bg-slate-50/70 px-4 py-3 sm:px-14">
                        {subs.length === 0 ? (
                          <div className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3">
                            <p className="text-xs font-medium text-slate-400">
                              No subcategories yet — add one to organize
                              products under {cat.name}.
                            </p>
                            <button
                              onClick={() => handleAddSubcategory(cat._id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#0856DF] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0645c8]"
                            >
                              <Plus size={13} /> Add
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {subs.map((sub) => {
                              const subImg = getImageUrl(sub.image as any);
                              const subCount = countSubProducts(cat, sub._id);
                              return (
                                <div
                                  key={sub._id}
                                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-[#0856DF]/20"
                                >
                                  {/* Circular thumbnail */}
                                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-white bg-slate-100 ring-1 ring-slate-200">
                                    {subImg ? (
                                      <Image
                                        src={subImg}
                                        alt={sub.name}
                                        fill
                                        style={{ objectFit: "cover" }}
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                                        <ImageIcon size={16} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-slate-800">
                                      {sub.name}
                                    </p>
                                    <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                      {sub.description ? (
                                        <span className="line-clamp-1 max-w-[240px]">
                                          {sub.description}
                                        </span>
                                      ) : null}
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                        {subCount} products
                                      </span>
                                      <span className="hidden md:inline-block">
                                        {statusBadge(sub.isActive)}
                                      </span>
                                    </p>
                                  </div>
                                  {cat.products && cat.products.length > 0 && (
                                    <button
                                      onClick={() =>
                                        setViewingProducts(
                                          viewingProducts === cat._id
                                            ? null
                                            : cat._id,
                                        )
                                      }
                                      className="hidden rounded-lg p-1.5 text-blue-600 transition hover:bg-blue-50 sm:inline-block"
                                      aria-label="View products"
                                    >
                                      <Eye size={15} />
                                    </button>
                                  )}
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    <button
                                      onClick={() =>
                                        handleEditSubcategory(cat, sub)
                                      }
                                      className="rounded-lg border border-blue-200 bg-blue-50 p-1.5 text-blue-600 transition hover:bg-blue-600 hover:text-white"
                                      aria-label="Edit subcategory"
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button
                                      onClick={() => setSubDeleteId(sub._id)}
                                      className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition hover:bg-red-600 hover:text-white"
                                      aria-label="Delete subcategory"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* View products (same behavior as before) */}
                  {viewingProducts === cat._id &&
                    cat.products &&
                    cat.products.length > 0 && (
                      <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-14">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Products in {cat.name}
                          </p>
                          <button
                            onClick={() => setViewingProducts(null)}
                            className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                          >
                            Close
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {cat.products.map((p: any) => (
                            <div
                              key={p._id}
                              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5"
                            >
                              {p.images?.[0] ? (
                                <img
                                  src={cloudinaryUrl(p.images[0].url, 80)}
                                  alt={p.name}
                                  className="h-9 w-9 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                                  <ImageIcon size={15} />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-slate-800">
                                  {p.name}
                                </p>
                                <p className="text-[11px] font-bold text-[#0856DF]">
                                  {formatPKR(p.price)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Category Create/Edit Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">
                {isEditMode ? "Edit Category" : "New Category"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4 overflow-y-auto px-6 py-5"
            >
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Category Image
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
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
                      id="category-image-upload"
                      className="hidden"
                      onChange={handleImageChange}
                      disabled={isSubmitting}
                    />
                    <label
                      htmlFor="category-image-upload"
                      className="inline-block w-full cursor-pointer rounded-xl border border-slate-300 bg-white py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Choose Image
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Category Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={handleNameChange}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                  placeholder="Enter category name"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Slug
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 p-3 font-mono text-sm text-slate-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full whitespace-pre-wrap break-words rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15 resize-none"
                  placeholder="Enter category description"
                  rows={5}
                  disabled={isSubmitting}
                />
                <div className="mt-2">
                  <AiGeneratorButton
                    name={formData.name}
                    context="category"
                    onGenerate={(text) =>
                      setFormData((prev) => ({ ...prev, description: text }))
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <input
                  type="checkbox"
                  checked={formData.usesSizeBasedPricing}
                  onChange={(e) =>
                    setFormData({ ...formData, usesSizeBasedPricing: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]/30"
                  disabled={isSubmitting}
                />
                <div>
                  <span className="text-sm font-semibold text-slate-700">
                    This category uses size-based pricing & stock
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    When enabled, products in this category require Admin to set Price and Stock per size instead of one global Price/Stock.
                  </p>
                </div>
              </div>

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

      {/* ── Subcategory Create/Edit Modal ── */}
      {subModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">
                {subEditMode ? "Edit Subcategory" : "New Subcategory"}
              </h3>
              <button
                onClick={() => setSubModalOpen(false)}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>

            <form
              onSubmit={handleSubSubmit}
              className="space-y-4 overflow-y-auto px-6 py-5"
            >
              {/* Image Upload Section */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Subcategory Image
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    {subImagePreview ? (
                      <img
                        src={subImagePreview}
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="text-slate-400" size={28} />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      id="subcategory-image-upload"
                      className="hidden"
                      onChange={handleSubImageChange}
                      disabled={isSubmitting}
                    />
                    <label
                      htmlFor="subcategory-image-upload"
                      className="inline-block w-full cursor-pointer rounded-xl border border-slate-300 bg-white py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Choose Image
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Parent Category
                </label>
                <select
                  value={subForm.parentCategory}
                  onChange={(e) =>
                    setSubForm({ ...subForm, parentCategory: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                  disabled={isSubmitting || (!subEditMode && !!subForm.parentCategory)}
                >
                  <option value="">Select Category</option>
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {subEditMode && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Changing the parent category moves this subcategory.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Subcategory Name
                </label>
                <input
                  type="text"
                  value={subForm.name}
                  onChange={(e) =>
                    setSubForm({ ...subForm, name: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                  placeholder="e.g. Shirts, T-Shirts, Jeans"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Description
                </label>
                <textarea
                  value={subForm.description}
                  onChange={(e) =>
                    setSubForm({ ...subForm, description: e.target.value })
                  }
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white p-3 text-sm font-medium outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                  placeholder="Enter subcategory description (optional)"
                  rows={3}
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <input
                  type="checkbox"
                  checked={subForm.isActive}
                  onChange={(e) =>
                    setSubForm({ ...subForm, isActive: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-[#0856DF] focus:ring-[#0856DF]/30"
                  disabled={isSubmitting}
                />
                <span className="text-sm font-semibold text-slate-700">
                  Active
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSubModalOpen(false)}
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
                    : subEditMode
                      ? "Update"
                      : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Category Modal ── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <Trash2 size={24} className="text-red-600" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-slate-900">
              Delete Category?
            </h3>
            <p className="mb-6 text-sm font-medium text-slate-500">
              This action cannot be undone. Categories with subcategories or
              products cannot be deleted until they are removed.
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

      {/* ── Delete Subcategory Modal ── */}
      {subDeleteId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <Trash2 size={24} className="text-red-600" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-slate-900">
              Delete Subcategory?
            </h3>
            <p className="mb-6 text-sm font-medium text-slate-500">
              This action cannot be undone. Subcategories with products cannot
              be deleted until their products are removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setSubDeleteId(null)}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubDelete}
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

export default CategoriesPage;
