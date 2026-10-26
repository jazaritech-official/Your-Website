import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: {
    cleanupOutdatedCaches: true,
    skipWaiting: true,
    // Customers never visit /Admin/*, so precaching its route chunks only
    // wastes first-install bandwidth. NOTE: Workbox evaluates `exclude`
    // against the asset path RELATIVE to the build output
    // ("static/chunks/app/Admin/Products/page-<hash>.js") and not against the
    // final "/_next/static/..." URL — matching the URL silently excluded
    // nothing, so 18 Admin chunks used to ship in the precache. Large binary
    // assets are dropped via `publicExcludes` below instead, because
    // additionalManifestEntries are not filtered by `exclude` at all.
    exclude: [
      ({ asset }) => /(?:^|\/)static\/chunks\/app\/Admin\//.test(asset.name),
      /\.wasm$/i,
      /\.mjs$/i,
      // Also skip the build manifest and ssg manifest (non-critical)
      /_buildManifest\.js$/,
      /_ssgManifest\.js$/,
    ],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB max per file
  },
  // Everything in public/ becomes an additionalManifestEntry and is therefore
  // downloaded on first install. These globs keep the large artwork under
  // public/ serving normally over HTTP (banner records may still reference
  // these URLs) while removing ~18 MB from the first-visit precache. Each
  // entry was verified to have zero references in src/, worker/,
  // manifest.json and CSS.
  publicExcludes: [
    "!noprecache/**/*",
    // Studio Banner.jpeg is 69 MB — the homepage fallback brand image.
    // It must stay in public/ for runtime but must never be precached.
    "!Studio Banner.jpeg",
    "!Eid Collection.png",
    "!Hajj Banner.png",
    "!Azaadi Collection.png",
    "!Mugs Carousel.png",
    "!Azaadi Collection Banner.png",
    "!Pop Sockets Carousel.png",
    "!Pop Sockets Banner.png",
    "!Eid Collection Banner.png",
    "!Customized Mugs Banner.png",
    "!Mugs.png",
    "!carousel/Accessories.jpg",
    "!carousel/Decors.jpg",
    "!carousel/Electronic Devices.jpg",
    "!carousel/Home appliances.jpg",
    "!carousel/Old Pics/**/*",
  ],
  customWorkerSrc: "worker",
});

const nextConfig: NextConfig = {
  // Strip debug console calls from production builds — keeps console.error
  // for genuine error reporting, removes log/debug/info noise.
  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ["error"] }
      : false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default withPWA(nextConfig);