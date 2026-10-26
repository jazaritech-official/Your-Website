import { cartLineKey, cartLineHash, findCartLine } from "../utils/cartIdentity.js";

/**
 * Regression coverage for the B1 cart-identity bug: a cart line must be keyed
 * by product + variant + customization. Previously the cart merged purely on
 * the product id, so a second customization of the same product overwrote the
 * first one's answers.
 */
describe("cartLineKey / cartLineHash — cart line identity", () => {
  const base = {
    productId: "64b7f1c2a1b2c3d4e5f60718",
    selectedColor: "",
    selectedSize: "",
    customizationAnswers: [],
  };

  it("is stable for the same input", () => {
    expect(cartLineKey(base)).toBe(cartLineKey({ ...base }));
    expect(cartLineHash(base)).toBe(cartLineHash({ ...base }));
  });

  it("A. identical lines without customization share one identity", () => {
    expect(cartLineHash(base)).toBe(cartLineHash({ ...base }));
  });

  it("B. same product + same customization share one identity", () => {
    const answers = [{ label: "Name", value: "Ali" }];
    expect(cartLineHash({ ...base, customizationAnswers: answers })).toBe(
      cartLineHash({ ...base, customizationAnswers: [{ label: "Name", value: "Ali" }] }),
    );
  });

  it("C. same product + different TEXT customization are different lines", () => {
    const a = cartLineHash({ ...base, customizationAnswers: [{ label: "Name", value: "Ali" }] });
    const b = cartLineHash({ ...base, customizationAnswers: [{ label: "Name", value: "Ahmed" }] });
    expect(a).not.toBe(b);
  });

  it("D. same product + different IMAGE customization are different lines", () => {
    const a = cartLineHash({
      ...base,
      customizationAnswers: [{ label: "Logo", value: "https://cdn/logo1.png" }],
    });
    const b = cartLineHash({
      ...base,
      customizationAnswers: [{ label: "Logo", value: "https://cdn/logo2.png" }],
    });
    expect(a).not.toBe(b);
  });

  it("E. a variant change keeps the line identity (variant is NOT part of it)", () => {
    // Switching size must not re-key the line: the existing quantity and
    // variant-update paths address the line by this key, so a new key would
    // strand the line and could duplicate it on the next add.
    expect(cartLineHash({ ...base, selectedSize: "S" })).toBe(
      cartLineHash({ ...base, selectedSize: "L" }),
    );
    expect(cartLineHash({ ...base, selectedColor: "Red" })).toBe(
      cartLineHash({ ...base, selectedColor: "Blue" }),
    );
  });

  it("E2. different variant AND different customization are still separate lines", () => {
    expect(
      cartLineHash({
        ...base,
        selectedSize: "S",
        customizationAnswers: [{ label: "Name", value: "Ali" }],
      }),
    ).not.toBe(
      cartLineHash({
        ...base,
        selectedSize: "L",
        customizationAnswers: [{ label: "Name", value: "Ahmed" }],
      }),
    );
  });

  it("F. answer ORDER does not change the identity", () => {
    const a = cartLineHash({
      ...base,
      customizationAnswers: [
        { label: "Name", value: "Ali" },
        { label: "City", value: "Karachi" },
      ],
    });
    const b = cartLineHash({
      ...base,
      customizationAnswers: [
        { label: "City", value: "Karachi" },
        { label: "Name", value: "Ali" },
      ],
    });
    expect(a).toBe(b);
  });

  it("trims incidental whitespace so equivalent answers match", () => {
    expect(
      cartLineHash({ ...base, selectedSize: "  M  ", customizationAnswers: [{ label: " Name ", value: " Ali " }] }),
    ).toBe(
      cartLineHash({ ...base, selectedSize: "M", customizationAnswers: [{ label: "Name", value: "Ali" }] }),
    );
  });

  it("ignores a populated product document's other fields", () => {
    const populated = {
      product: { _id: base.productId, name: "Shirt", price: 0 },
      selectedColor: "",
      selectedSize: "",
      customizationAnswers: [],
    };
    expect(cartLineHash(populated)).toBe(cartLineHash(base));
  });

  it("produces a URL-safe 16-char hex id", () => {
    const hash = cartLineHash(base);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("no customization and an empty-string answer set agree", () => {
    expect(cartLineHash(base)).toBe(cartLineHash({ ...base, customizationAnswers: undefined }));
  });

  describe("findCartLine", () => {
    const line = { product: base.productId, selectedSize: "M", customizationAnswers: [] };
    const user = { cart: [line] };

    it("resolves by line hash", () => {
      expect(findCartLine(user, cartLineHash(line))).toBe(line);
    });

    it("falls back to a bare product id for legacy clients", () => {
      expect(findCartLine(user, base.productId)).toBe(line);
    });

    it("returns undefined for an unknown address", () => {
      expect(findCartLine(user, "nope")).toBeUndefined();
      expect(findCartLine(user, "")).toBeUndefined();
    });
  });
});
