/**
 * Deterministic identity for ONE cart line — client mirror of
 * `Backend/utils/cartIdentity.js`.
 *
 * A line is identified by the product PLUS the picked variant PLUS the
 * customization answers. Without this, adding the same product twice with
 * different customization merged the lines and overwrote the first set of
 * answers, and two lines that legitimately share a product id could not be
 * addressed separately for quantity/remove.
 *
 * `cartLineHash` is the URL-safe id used to address one line
 * (`PUT/DELETE /cart/:lineHash`) and as the React key. For authenticated carts
 * the server returns `cartItemKey` and that value is preferred (authoritative);
 * this local copy covers GUEST carts, which have no server to derive it.
 */

const FIELD_SEP = "\u001f";
const ANSWER_SEP = "\u001e";
const PAIR_SEP = "\u001d";

const norm = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

export interface CartLineIdentityInput {
  /** Preferred product reference (the product ObjectId). */
  productId?: unknown;
  /** Populated product document, or a raw product id. */
  product?: unknown;
  /** Client-side cart rows (localStorage) carry the product id as `_id`. */
  _id?: unknown;
  selectedColor?: string;
  selectedSize?: string;
  customizationAnswers?: Array<{ label: string; value: string }>;
}

/** Answer order must not change the identity, so the pairs are sorted. */
const normalizeAnswers = (
  answers?: Array<{ label: string; value: string }>,
): string => {
  if (!Array.isArray(answers)) return "";
  return answers
    .filter((answer) => answer && typeof answer.label === "string")
    .map((answer) => `${norm(answer.label)}${PAIR_SEP}${norm(answer.value)}`)
    .sort()
    .join(ANSWER_SEP);
};

export const cartLineKey = (
  line: CartLineIdentityInput | null | undefined,
): string => {
  // `_id` is only consulted as a last resort: on the client it always holds
  // the product id, but on a server cart subdocument it is the subdocument id.
  const rawProduct = line?.productId ?? line?.product ?? line?._id;
  const productRef =
    rawProduct && typeof rawProduct === "object" && (rawProduct as { _id?: unknown })._id
      ? (rawProduct as { _id: unknown })._id
      : rawProduct;

  // The variant is deliberately NOT part of the identity: a line keeps its
  // identity when the customer switches size, so variant updates keep
  // addressing the same line. Only product + customization distinguish lines.
  return [norm(productRef), normalizeAnswers(line?.customizationAnswers)].join(
    FIELD_SEP,
  );
};

/** FNV-1a (32-bit), kept exact with Math.imul so it matches the server. */
const fnv1a32 = (text: string, seed: number): number => {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
};

const hex8 = (value: number): string => value.toString(16).padStart(8, "0");

/** URL-safe 16-char id for one cart line (two independent 32-bit passes). */
export const cartLineHash = (
  line: CartLineIdentityInput | null | undefined,
): string => {
  const key = cartLineKey(line);
  return (
    hex8(fnv1a32(key, 2166136261)) + hex8(fnv1a32(key, 16777619))
  );
};

/**
 * Prefer the server-issued key (authoritative for authenticated carts) and
 * fall back to the local hash for guest carts / rows the server didn't tag.
 */
export const resolveLineKey = (
  serverKey: string | undefined | null,
  line: CartLineIdentityInput,
): string => (serverKey ? String(serverKey) : cartLineHash(line));

export default cartLineKey;
