"use client";

import { useEffect, useState } from "react";
import useFetch, { baseUrl } from "@/app/utils/commonFunctions";
import type { ApiEnvelope, Category, SubcategoryOption } from "./productTypes";

/**
 * Loads the catalog options the Admin product form + product list depend on:
 * every category (with its `usesSizeBasedPricing` flag) and every subcategory
 * (with its parent link).
 *
 * Extracted from Admin/Products/page.tsx so the Products list page and the
 * dedicated Add Product page share ONE loader instead of duplicating the same
 * two requests + normalisation effects. Response shapes and the
 * `categoriesLoaded` gate are preserved exactly.
 *
 * Caching: categories reuse the app-wide `categories` cache namespace
 * (5 minutes) that the Admin Categories page already invalidates on every
 * category/subcategory mutation (invalidateCache("categories")), so this can
 * never serve stale `usesSizeBasedPricing` flags. Subcategories are NOT cached
 * here on purpose — the admin must always see a newly created subcategory
 * immediately in the product form. Both endpoints also benefit from the
 * shared in-flight de-duplication inside useFetch when several components
 * request them in the same tick.
 */
const CATEGORIES_CACHE_KEY = "categories";
const CATEGORIES_STALE_TIME = 5 * 60 * 1000;

type CategoriesBody = Category[] | { categories?: Category[] };
type SubcategoriesBody =
  | SubcategoryOption[]
  | { subcategories?: SubcategoryOption[] };

export interface ProductCatalogOptions {
  categories: Category[];
  subcategories: SubcategoryOption[];
  /** True once the category settings (incl. usesSizeBasedPricing) are loaded. */
  categoriesLoaded: boolean;
}

export const useProductCatalogOptions = (): ProductCatalogOptions => {
  const { data: categoriesRes } = useFetch<ApiEnvelope<CategoriesBody>>(
    `${baseUrl}category/getAllCategories`,
    { cacheKey: CATEGORIES_CACHE_KEY, staleTime: CATEGORIES_STALE_TIME },
  );
  const { data: subcategoriesRes } = useFetch<ApiEnvelope<SubcategoriesBody>>(
    `${baseUrl}subcategory/getAllSubcategories`,
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<SubcategoryOption[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  // Load categories (same normalisation + gate as before the extraction).
  useEffect(() => {
    const body = categoriesRes?.data;
    if (!body) return;
    let categoriesArray: Category[] = [];
    if (Array.isArray(body)) {
      categoriesArray = body;
    } else if (Array.isArray(body.categories)) {
      categoriesArray = body.categories;
    }
    setCategories(Array.isArray(categoriesArray) ? categoriesArray : []);
    setCategoriesLoaded(true);
  }, [categoriesRes?.data]);

  // Load subcategories.
  useEffect(() => {
    const body = subcategoriesRes?.data;
    if (!body) return;
    const list = Array.isArray(body) ? body : body.subcategories ?? [];
    setSubcategories(Array.isArray(list) ? list : []);
  }, [subcategoriesRes?.data]);

  return { categories, subcategories, categoriesLoaded };
};

export default useProductCatalogOptions;
