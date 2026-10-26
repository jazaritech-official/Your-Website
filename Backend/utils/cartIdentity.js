/**
 * Deterministic identity for ONE cart line.
 *
 * A cart line is identified by the product PLUS the variant the customer
 * picked PLUS the customization answers they supplied. Two lines that differ
 * in any of those must stay separate — previously they were merged on the
 * product id alone, so adding the same product again with different
 * customization silently overwrote the first set of answers.
 *
 * `cartLineKey` builds the readable composite; `cartLineHash` turns it into a
 * URL-safe id that clients use to address one line. The composite is built
 * from control-character separators that cannot appear in a product id or a
 * customization value, so distinct lines cannot collide (and two independent
 * FNV-1a passes give a 64-bit digest).
 *
 * The variant is deliberately NOT part of the identity: a line keeps its
 * identity when the customer switches size, so the existing variant-update
 * and quantity paths keep addressing the same line. Only the product and the
 * customization answers distinguish lines.
 *
 * Mirrored in `Frontend/src/app/utils/cartIdentity.ts`. The client only needs
 * its own copy for GUEST carts (no server to ask); for authenticated carts the
 * server returns `cartItemKey`, which is authoritative.
 */

const FIELD_SEP = "\u001f";
const ANSWER_SEP = "\u001e";
const PAIR_SEP = "\u001d";

const norm = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

/** Answer order must not change the identity, so the pairs are sorted. */
const normalizeAnswers = (answers) => {
  if (!Array.isArray(answers)) return "";
  return answers
    .filter((answer) => answer && typeof answer.label === "string")
    .map((answer) => `${norm(answer.label)}${PAIR_SEP}${norm(answer.value)}`)
    .sort()
    .join(ANSWER_SEP);
};

/**
 * @param {{ productId?: any, product?: any, selectedColor?: string,
 *           selectedSize?: string, customizationAnswers?: Array<{label:string,value:string}> }} line
 *   `productId` may be a string/ObjectId; `product` may be either a raw
 *   ObjectId (unpopulated cart subdocument) or a populated product document.
 *   `_id` is deliberately NOT consulted — on a cart subdocument that is the
 *   subdocument's own id, not the product's.
 */
export const cartLineKey = (line) => {
  const rawProduct = line?.productId ?? line?.product;
  const productRef =
    rawProduct && typeof rawProduct === "object" && rawProduct._id
      ? rawProduct._id
      : rawProduct;

  return [norm(productRef), normalizeAnswers(line?.customizationAnswers)].join(
    FIELD_SEP,
  );
};

/** FNV-1a (32-bit), kept exact with Math.imul so TS/JS agree. */
const fnv1a32 = (text, seed) => {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
};

const hex8 = (value) => value.toString(16).padStart(8, "0");

/** URL-safe 16-char id for one cart line (two independent 32-bit passes). */
export const cartLineHash = (line) =>
  hex8(fnv1a32(cartLineKey(line), 2166136261)) +
  hex8(fnv1a32(cartLineKey(line), 16777619));

/**
 * Resolve one cart line from a request value that may be the line hash
 * (current clients) or a bare product id (legacy clients and in-flight
 * requests). The product-id fallback keeps the old addressing working.
 */
export const findCartLine = (user, value) => {
  const wanted = String(value ?? "");
  if (!wanted) return undefined;
  const byKey = user.cart.find((item) => cartLineHash(item) === wanted);
  if (byKey) return byKey;
  return user.cart.find((item) => norm(item.product) === wanted);
};

export default cartLineKey;
