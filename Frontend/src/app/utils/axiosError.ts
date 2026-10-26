/**
 * Typed axios-error message extraction.
 *
 * Shared by the Showcase Studio / Pitch Records pages so catch blocks stay
 * `err: unknown` (no `any`) while still surfacing the backend's message.
 * Falls back to a caller-supplied generic message for non-HTTP failures
 * (network drop, abort, serialization…).
 */
import axios from "axios";

export const apiErrorMessage = (err: unknown, fallback: string): string =>
  axios.isAxiosError(err) && typeof err.response?.data?.message === "string"
    ? err.response.data.message
    : fallback;
