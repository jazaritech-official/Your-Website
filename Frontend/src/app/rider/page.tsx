import { redirect } from "next/navigation";

/**
 * Rider entry route.
 *
 * Login, the navbar, and the rider layout header all link to `/rider`,
 * but the actual dashboard lives at `/rider/dashboard`. This page simply
 * redirects there so `/rider` always resolves — no duplicated UI or logic.
 */
export default function RiderPage() {
  redirect("/rider/dashboard");
}
