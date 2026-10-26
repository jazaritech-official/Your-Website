import { jazzcashProvider } from "./jazzcash.js";
import { easypaisaProvider } from "./easypaisa.js";
import { meezanProvider } from "./meezan.js";

/* ===========================================================
   PAYMENT PROVIDER FACTORY
   Central registry for all payment gateways. Each provider
   implements the same interface:
     - initializePayment(order, customerInfo) → { url, transactionRef }
     - verifyPayment(transactionRef, orderId) → { status, amount, raw }
   =========================================================== */

const providers = {
  jazzcash: jazzcashProvider,
  easypaisa: easypaisaProvider,
  meezan: meezanProvider,
};

/**
 * Get a payment provider by name.
 * @param {string} name - Provider identifier (jazzcash, easypaisa, meezan)
 * @returns {object|null} Provider instance or null if not found/configured
 */
export const getPaymentProvider = (name) => {
  const provider = providers[name?.toLowerCase()];
  if (!provider) return null;
  // Only return if the provider is configured (has required credentials)
  if (!provider.isConfigured()) return null;
  return provider;
};

/**
 * Check if a payment provider is available.
 * @param {string} name
 * @returns {boolean}
 */
export const isProviderAvailable = (name) => {
  const provider = providers[name?.toLowerCase()];
  return provider ? provider.isConfigured() : false;
};

/**
 * Get all available (configured) payment providers.
 * @returns {Array<{ name: string, displayName: string }>}
 */
export const getAvailableProviders = () => {
  return Object.entries(providers)
    .filter(([, p]) => p.isConfigured())
    .map(([name, p]) => ({ name, displayName: p.displayName }));
};
