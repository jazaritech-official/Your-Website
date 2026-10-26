// Service Worker custom worker script
// PWA caching and offline support is handled by the generated service worker.
// This file adds push notification event handlers.

// ==========================================
// PUSH EVENT — Show notification when push arrives
// ==========================================
self.addEventListener("push", (event) => {
  let data = {};

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.warn("[SW] Invalid push data:", e.message);
    try {
      // Fallback: try parsing as plain text
      const text = event.data?.text?.() || "New notification";
      data = { title: text, body: "", link: "/" };
    } catch {
      data = { title: "Irhas'Inn", body: "New notification", link: "/" };
    }
  }

  const { title, body, icon, badge, link } = data;

  const options = {
    body: body || "",
    icon: icon || "/icons/icon-192x192-maskable.png",
    badge: badge || "/icons/icon-192x192.png",
    vibrate: [200, 100, 200],
    data: {
      link: link || "/",
      dateOfArrival: Date.now(),
    },
    actions: [
      {
        action: "open",
        title: "View Details",
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title || "Irhas'Inn", options));
});

// ==========================================
// NOTIFICATION CLICK — Navigate to the notification link
// ==========================================
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const link = event.notification.data?.link || "/";

  // Try to open/focus an existing tab, otherwise open a new one
  const urlToOpen = new URL(link, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((windowClients) => {
        // Check if there's already a tab with the site open
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            // Navigate the existing tab to the link
            return client.navigate(urlToOpen).then(() => client.focus());
          }
        }
        // Open a new tab
        return clients.openWindow(urlToOpen);
      })
  );
});

// ==========================================
// NOTIFICATION CLOSE — Optional logging
// ==========================================
self.addEventListener("notificationclose", (event) => {
  // Can be used for analytics
});