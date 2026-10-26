import type { MetadataRoute } from "next";

const BASE_URL = "https://irhasinn.vercel.app";
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://irhasinnbackend.vercel.app/api/v1";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/productsPage`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/cart`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/checkout`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/profile`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  // Fetch products and categories from the API for dynamic pages
  try {
    const [productsRes, categoriesRes] = await Promise.all([
      fetch(`${API_URL}/product/getAllProducts?limit=200`, {
        next: { revalidate: 3600 }, // revalidate every hour
      }).catch(() => null),
      fetch(`${API_URL}/category/getAllCategories`, {
        next: { revalidate: 3600 },
      }).catch(() => null),
    ]);

    if (productsRes?.ok) {
      const productsData = await productsRes.json();
      const products = productsData?.data?.products || productsData?.data || [];
      if (Array.isArray(products)) {
        for (const product of products) {
          if (product.slug) {
            staticPages.push({
              url: `${BASE_URL}/product/${product.slug}`,
              lastModified: product.updatedAt
                ? new Date(product.updatedAt)
                : new Date(),
              changeFrequency: "weekly",
              priority: 0.8,
            });
          }
        }
      }
    }

    if (categoriesRes?.ok) {
      const categoriesData = await categoriesRes.json();
      const categories = categoriesData?.data || [];
      if (Array.isArray(categories)) {
        for (const category of categories) {
          if (category.slug) {
            staticPages.push({
              url: `${BASE_URL}/category/${category.slug}`,
              lastModified: category.updatedAt
                ? new Date(category.updatedAt)
                : new Date(),
              changeFrequency: "weekly",
              priority: 0.7,
            });
          }
        }
      }
    }
  } catch {
    // On failure, just return static pages
  }

  return staticPages;
}
