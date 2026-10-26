import { baseUrl as API_BASE } from "./apiBase";

/**
 * Check if the browser supports notifications and the current permission status.
 */
export function checkPermissionStatus(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

/**
 * Request notification permission from the user.
 */
export async function requestPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Convert the PushSubscription object to a plain object for sending to the backend.
 */
function subscriptionToPlain(sub: PushSubscription) {
  const key = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: {
      auth: key.keys?.auth || "",
      p256dh: key.keys?.p256dh || "",
    },
  };
}

/**
 * Subscribe the current device to push notifications.
 * Requests permission if needed, then subscribes via the service worker.
 */
export async function subscribe(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) {
    console.warn("[PushClient] Notifications not supported");
    return false;
  }

  // Request permission if not granted
  if (Notification.permission === "denied") {
    console.warn("[PushClient] Notifications are blocked");
    return false;
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[PushClient] Permission not granted");
      return false;
    }
  }

  // Check for service worker
  if (!("serviceWorker" in navigator)) {
    console.warn("[PushClient] Service Worker not supported");
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Get the VAPID public key from environment
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.warn("[PushClient] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set");
      return false;
    }

    // Convert base64 public key to Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

    // Subscribe
    let subscription: PushSubscription;
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (subErr) {
      // If already subscribed, get the existing subscription
      const existing = await registration.pushManager.getSubscription();
      if (!existing) {
        console.error("[PushClient] Failed to subscribe:", subErr);
        return false;
      }
      subscription = existing;
    }

    // Send subscription to backend
    const subData = subscriptionToPlain(subscription);
    const response = await fetch(`${API_BASE}push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(subData),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("[PushClient] Backend subscribe failed:", errData);
      return false;
    }

    console.log("[PushClient] Successfully subscribed to push notifications");
    return true;
  } catch (error) {
    console.error("[PushClient] Subscribe error:", error);
    return false;
  }
}

/**
 * Unsubscribe the current device from push notifications.
 */
export async function unsubscribe(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Get endpoint before unsubscribing locally
      const endpoint = subscription.endpoint;

      // Unsubscribe locally
      await subscription.unsubscribe();

      // Notify backend
      await fetch(`${API_BASE}push/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ endpoint }),
      });
    }

    console.log("[PushClient] Successfully unsubscribed");
    return true;
  } catch (error) {
    console.error("[PushClient] Unsubscribe error:", error);
    return false;
  }
}

/**
 * Convert a base64-encoded URL string to a Uint8Array for use with
 * pushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
