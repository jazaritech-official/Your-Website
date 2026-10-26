"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";

export default function GoogleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  if (!clientId) {
    console.warn("GoogleProvider: NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured — Google OAuth will not be available");
    return <>{children}</>;
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      {children}
    </GoogleOAuthProvider>
  );
}

/*
 * NOTE: The app name shown on the Google Sign-In consent screen
 * is controlled by the Google Cloud Console OAuth consent screen
 * configuration — it CANNOT be changed from the codebase.
 *
 * To update it:
 * 1. Go to https://console.cloud.google.com/apis/credentials/consent
 * 2. Under "App information" → "App name", change it to "Irhas'Inn"
 * 3. Optionally upload /Irha Studio-12.jpg as the app logo
 * 4. Save and re-verify the consent screen if needed
 */
