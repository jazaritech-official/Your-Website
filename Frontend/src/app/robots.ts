import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/Admin/",
          "/profile/",
          "/cart",
          "/checkout",
          "/chat",
          "/rider/",
          "/api/",
        ],
      },
    ],
    sitemap: "https://irhasinn.vercel.app/sitemap.xml",
  };
}
