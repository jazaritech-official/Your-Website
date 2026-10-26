import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import AIProductChat from "./Components/AIProductChat";
import AnimatedBackgroundAccents from "./Components/AnimatedBackgroundAccents";
import ClientLayout from "./ClientLayout";
import GoogleProvider from "./GoogleProvider";
import RouteProgressBar from "./Components/RouteProgressBar";
import Providers from "./Redux/Providers/provider";
import { ThemeProvider } from "./Components/ThemeProvider";
import {
  buildThemeCss,
  DEFAULT_SITE_NAME,
  resolveLogoUrl,
  THEME_STYLE_ID,
} from "./utils/dynamicTheme";
import { getServerTheme } from "./utils/dynamicThemeServer";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
const siteUrl = "https://irhasinn.vercel.app";

/*
 * Static base metadata. The ADMIN-CONFIGURED branding (site name + logo) is
 * layered on top in generateMetadata() below — it cannot live here because
 * Next.js forbids exporting both `metadata` and `generateMetadata` from the
 * same segment.
 */
const BASE_METADATA: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Irhas'Inn | Premium Online Shopping in Pakistan",
    template: "%s | Irhas'Inn",
  },
  description:
    "Shop the latest trendy fashion, accessories, and lifestyle products at Irhas'Inn. Premium quality, affordable prices, fast delivery across Pakistan.",
  keywords: [
    "Irhas'Inn",
    "online shopping Pakistan",
    "trendy fashion store",
    "premium e-commerce",
    "buy clothes online Pakistan",
    "accessories online store",
    "Irhas'Inn",
  ],
  authors: [{ name: "Irhas'Inn" }],
  creator: "Irhas'Inn",
  publisher: "Irhas'Inn",
  applicationName: "Irhas'Inn",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/Irha Studio-12.jpg", type: "image/png", sizes: "192x192" },
    ],
    apple: "/Irha Studio-12.jpg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Irhas'Inn",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Irhas'Inn",
    title: "Irhas'Inn | Premium Online Shopping in Pakistan",
    description:
      "Shop the latest trendy fashion, accessories, and lifestyle products at Irhas'Inn. Premium quality, affordable prices, fast delivery across Pakistan.",
    images: [
      {
        url: "/Irha Studio-12.jpg",
        width: 800,
        height: 800,
        alt: "Irhas'Inn",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Irhas'Inn | Premium Online Shopping in Pakistan",
    description:
      "Shop the latest trendy fashion, accessories, and lifestyle products at Irhas'Inn.",
    images: ["/Irha Studio-12.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: [
      "O7tMFq5hf-oGfMl6diWnTNPK3H60yPhvrAoWcJuZH2o",
      "h9HbGrTmTRWd0g2xeUlfvs1qhHcTSm-DFmqRqLPdRlU",
      "asQgU04YbN2VFc0Wg8lwnUreINxwmzoiTYvO8hZitQE",
    ],
  },
  other: {
    "google-adsense-account": "ca-pub-4997256974332756",
  },
  category: "e-commerce",
};

export async function generateViewport(): Promise<Viewport> {
  const theme = await getServerTheme();
  return {
    // Browser/OS chrome colour follows the admin's accent (was a hard-coded
    // gold). Falls back to the original value when the theme is unavailable.
    themeColor: theme?.colors?.brandGold || "#C8A84E",
    width: "device-width",
    initialScale: 1,
  };
}

/**
 * Layered on top of BASE_METADATA so an Admin's site name / logo reach the
 * page title, social cards and the non-favicon icon entries — the same
 * branding elements the audit located in this file.
 *
 * Everything degrades to the original hard-coded values if the theme cannot
 * be read, so this can never produce a worse result than before the feature.
 *
 * (The favicon itself stays the static /favicon.ico: a runtime-replaceable
 * favicon would need a separate image-proxy route — flagged as a known
 * limitation rather than shipped half-working.)
 */
export async function generateMetadata(): Promise<Metadata> {
  const theme = await getServerTheme();
  const name = theme?.siteName?.trim() || DEFAULT_SITE_NAME;
  const logo = resolveLogoUrl(theme?.logoUrl);

  return {
    ...BASE_METADATA,
    applicationName: name,
    title: {
      default: `${name} | Premium Online Shopping in Pakistan`,
      template: `%s | ${name}`,
    },
    icons: {
      icon: [
        { url: "/favicon.ico" },
        { url: logo, type: "image/png", sizes: "192x192" },
      ],
      apple: logo,
    },
    openGraph: {
      ...(BASE_METADATA.openGraph || {}),
      siteName: name,
      title: `${name} | Premium Online Shopping in Pakistan`,
      images: [{ url: logo, width: 800, height: 800, alt: name }],
    },
    twitter: {
      ...(BASE_METADATA.twitter || {}),
      images: [logo],
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * Dynamic brand theme (Tailwind v4 @theme custom properties, overridden at
   * runtime). Fetched with ISR + a cache tag, so prerendered routes stay
   * static and the storefront is never made dynamic by this feature.
   */
  const theme = await getServerTheme();
  const themeCss = buildThemeCss(theme?.cssVars);
  /*
   * Passed to client components (Navbar, Footer, loaders, 404) so the logo and
   * text branding follow the Admin's settings. Values come from the SAME server
   * fetch that produced the colour overrides — no client request, and they are
   * present in the prerendered HTML so nothing pops in after hydration.
   */
  const branding = {
    logoUrl: theme?.logoUrl,
    siteName: theme?.siteName,
    tagline: theme?.tagline,
  };

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Rendered as the FIRST node in <body> (same in-document approach the
            JSON-LD blocks below already use) so it is parsed before any themed
            content is painted — no flash of default colours. The selector is
            `html:root`, which outranks Tailwind's own `:root` block regardless
            of evaluation order. */}
        {themeCss ? (
          <style
            id={THEME_STYLE_ID}
            dangerouslySetInnerHTML={{ __html: themeCss }}
          />
        ) : null}
        {/* Global ambient background — ONE instance for the whole site.
            `z-index: -1` keeps it strictly behind every content layer, and it
            is `position: fixed`, so it never affects layout or scrollbars.
            Rendered right after the theme overrides so the colour variables it
            binds to are already in the document. */}
        <AnimatedBackgroundAccents />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              // Follows the Admin's branding so structured data never advertises
              // a site name / logo the storefront no longer shows.
              name: theme?.siteName?.trim() || DEFAULT_SITE_NAME,
              url: siteUrl,
              logo: new URL(resolveLogoUrl(theme?.logoUrl), siteUrl).toString(),
              sameAs: [
                // Yahan apne social media links daal dena (Facebook, Instagram, etc.)
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: theme?.siteName?.trim() || DEFAULT_SITE_NAME,
              url: siteUrl,
              potentialAction: {
                "@type": "SearchAction",
                // The real search route is /ai-search (it reads the `q` query
                // param). The old /search?q=... target pointed at a route that
                // does not exist, so Google's sitelinks search box resolved to
                // a 404 instead of running a search.
                target: `${siteUrl}/ai-search?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
        {/* AdSense loaded as a raw <script> (not next/script) because
            AdSense's internal check rejects scripts that carry the
            data-nscript attribute Next.js <Script> injects. */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4997256974332756"
          crossOrigin="anonymous"
        />
        {/* Accessibility: Skip to main content link (visible on keyboard focus) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:rounded-lg focus:bg-teal-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>
        <ThemeProvider branding={branding}>
          <Providers>
            <GoogleProvider>
              <ClientLayout>{children}</ClientLayout>
              <RouteProgressBar />
              <AIProductChat />
            </GoogleProvider>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
