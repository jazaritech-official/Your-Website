"use client";
import { formatPKR } from "@/app/utils/format";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import confetti from "canvas-confetti";
import { useDispatch, useSelector } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, CreditCard, MapPin,
  ShoppingCart, XCircle, ChevronRight, X,
  Gift, Wallet, Shield, BadgeCheck,
} from "lucide-react";
import { RootState, AppDispatch } from "../Redux/store";
import useFetch, {
  baseUrl,
  getLocalCart,
  setLocalCart,
  showToast,
  cloudinaryUrl,
  getVariantOptions,
  resolveItemPrice,
  isValidPakistaniPhone,
} from "../utils/commonFunctions";
import { openLogin } from "../Redux/Features/modalSlice";
import { loginSuccess } from "../Redux/Features/authSlice";
import { useFormAutosave } from "../utils/useFormAutosave";
import { usePreviewSync } from "../utils/usePreviewSync";
import { resolveLineKey } from "../utils/cartIdentity";
import FreeShippingProgressBar from "../Components/FreeShippingProgressBar";
import { useCartActions } from "../utils/useCartActions";
import {
  getFieldKey,
  isImageUrlValue,
  sanitizePreviewText,
  validateImageFile,
  downscaleImageFile,
} from "../utils/customizationPreview";
import dynamic from "next/dynamic";
import ReferralUnlockedModal from "../Components/referral/ReferralUnlockedModal";
import { referralAckKey, type ReferralOverview } from "../utils/referral";
import {
  calculateCheckoutShipping,
  getShippingSettings,
  type ShippingSettings,
} from "../utils/shipping";
import ConfirmationModal from "../Components/checkout/ConfirmationModal";
import CheckoutItemCard, {
  type CheckoutCartItem,
} from "../Components/checkout/CheckoutItemCard";
import { playOrderSound } from "../utils/notificationSounds";
import SearchableSelect from "../Components/checkout/SearchableSelect";
import {
  COUNTRIES,
  searchCountries,
  getCitiesForCountry,
  searchCities,
  findCountryByName,
  findCityInCountry,
} from "../utils/countries";
import { LogoLockup, StepIndicator, PriceSummary, SectionLabel } from "../Components/ui";

const LocationPicker = dynamic(
  () => import("../Components/LocationPicker"),
  { ssr: false }
);

/** Any cart item above this quantity makes the whole order a bulk order. */
const BULK_ORDER_THRESHOLD = 10;

/**
 * Cart line shape — ONE definition, owned by the card that renders it
 * (Components/checkout/CheckoutItemCard). Aliased here so the rest of this
 * file keeps its existing `CartItem` name.
 */
type CartItem = CheckoutCartItem;

interface UserData {
  username: string;
  email: string;
  phoneNo?: number | string;
  address?: string;
  profilePic?: string;
}

interface UserApiResponse {
  status: number;
  message: string;
  data: UserData;
}

const normalizeCartItem = (item: any): CartItem => {
  const _id = item._id || item.id || item.productId || item.product?._id || "";
  const selectedColor = item.selectedColor || item.color || item.variant?.color;
  const selectedSize = item.selectedSize || item.size || item.variant?.size;
  return {
    ...item,
    _id,
    selectedColor,
    selectedSize,
    lineKey: resolveLineKey(item.cartItemKey, {
      productId: _id,
      selectedColor,
      selectedSize,
      customizationAnswers: item.customizationAnswers || [],
    }),
    colors: item.colors || item.product?.colors || [],
    sizes: item.sizes || item.product?.sizes || [],
    customizable: item.customizable || item.product?.customizable || false,
    customizationFields: item.customizationFields || item.product?.customizationFields || [],
    variantPricing: item.variantPricing || item.product?.variantPricing || {},
    variantStock: item.variantStock || item.product?.variantStock || {},
    category: item.category || item.product?.category,
  };
};

/**
 * Display name for one cart line's category.
 *
 * Guest carts carry the populated category object; the logged-in cart API
 * returns only the category id, which is resolved through the app-wide
 * `categories` cache (same cacheKey/staleTime the products page already
 * warms, so this normally costs no extra request).
 */
const resolveCategoryName = (
  item: CartItem,
  categoryNameById: Map<string, string>,
): string => {
  const raw = item.category;
  if (!raw) return "";
  if (typeof raw === "string") return categoryNameById.get(raw) || "";
  if (raw.name) return raw.name;
  return raw._id ? categoryNameById.get(raw._id) || "" : "";
};

/** Release a blob: preview URL — only local object URLs are revocable; a
 *  prefilled Cloudinary URL must never be touched. */
const revokePreviewUrl = (url?: string | null) => {
  if (url && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* already released */
    }
  }
};

const CHECKOUT_IDEMPOTENCY_KEY = "irhasinn_checkout_idempotency_key";

const getCheckoutIdempotencyKey = (): string => {
  if (typeof window === "undefined") return "";
  try {
    let key = sessionStorage.getItem(CHECKOUT_IDEMPOTENCY_KEY);
    if (!key) {
      key =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `chk-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      sessionStorage.setItem(CHECKOUT_IDEMPOTENCY_KEY, key);
    }
    return key;
  } catch {
    return `chk-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
};

const CheckoutPage = () => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { restore, save, clear } = useFormAutosave("checkout_form_draft");

  const defaultForm = { fullName: "", phoneNo: "", address: "", city: "Karachi", country: "Pakistan" };
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  // True until the cart (local or backend) has resolved — prevents the
  // "Your cart is empty" screen from flashing before the items load.
  const [cartLoading, setCartLoading] = useState(true);
  const [form, setForm] = useState(() => {
    const saved = restore();
    return saved ?? defaultForm;
  });
  const [useSavedAddress, setUseSavedAddress] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [loading, setLoading] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  const [referralCode, setReferralCode] = useState("");
  const [appliedReferral, setAppliedReferral] = useState<{
    code: string;
    referrerName: string;
    estimatedReward: number;
  } | null>(null);
  const [referralError, setReferralError] = useState("");
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralOverview, setReferralOverview] = useState<ReferralOverview | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const [showUnlocked, setShowUnlocked] = useState(false);
  const [unlockedCode, setUnlockedCode] = useState("");
  const [customizationAnswers, setCustomizationAnswers] = useState<Record<string, Record<string, string>>>({});
  const [customizationFiles, setCustomizationFiles] = useState<Record<string, Record<string, File | null>>>({})
  const [customizationPreviews, setCustomizationPreviews] = useState<Record<string, Record<string, string>>>({})
  const [customizationErrors, setCustomizationErrors] = useState<string[]>([]);
  const [uploadingCustomization, setUploadingCustomization] = useState(false);
  const [removeBgFor, setRemoveBgFor] = useState<Record<string, Record<string, boolean>>>({});
  const [shippingSettings, setShippingSettings] = useState<ShippingSettings | null>(null);

  const previewRoomId = useMemo(() => {
    if (typeof window === "undefined") return null;
    if (auth._id) return `user:${auth._id}`;
    let id = sessionStorage.getItem("irhasinn_preview_room");
    if (!id) {
      id = `anon:${Math.random().toString(36).slice(2, 12)}`;
      sessionStorage.setItem("irhasinn_preview_room", id);
    }
    return id;
  }, [auth._id]);
  const { publish: publishPreview } = usePreviewSync(previewRoomId);
  const prefilledItemsRef = useRef<Set<string>>(new Set());
  const [selectedLocation, setSelectedLocation] = useState<{
    address: string;
    lat: number;
    lng: number;
    city?: string;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<Array<{ id: string; name: string; available: boolean }>>([
    { id: "cod", name: "Cash on Delivery", available: true },
  ]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationOrder, setConfirmationOrder] = useState<{
    orderId: string;
    serialNumber?: number;
    items: Array<{ name: string; quantity: number; unitPrice: number; selectedColor?: string; selectedSize?: string; productImage?: string }>;
    itemsPrice: number;
    shippingPrice: number;
    discountAmount: number;
    totalPrice: number;
    paymentMethod: string;
    shippingAddress: { fullName: string; city: string; country: string };
  } | null>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  // Mobile-only: the order summary is an accordion below `lg`, collapsed by
  // default so item count + payable total are visible immediately.
  const [summaryOpen, setSummaryOpen] = useState(false);

  const orderType: "normal" | "bulk" = useMemo(
    () =>
      cartItems.some((item) => item.quantity > BULK_ORDER_THRESHOLD)
        ? "bulk"
        : "normal",
    [cartItems],
  );

  const selectedCountry = useMemo(() => findCountryByName(form.country), [form.country]);
  const countryOptions = useMemo(
    () => searchCountries(countrySearch).map((c) => ({ label: c.name, value: c.code })),
    [countrySearch],
  );
  const cityOptions = useMemo(() => {
    if (!selectedCountry) return [];
    return searchCities(selectedCountry.code, citySearch).map((c) => ({
      label: c.name,
      value: c.name,
    }));
  }, [selectedCountry, citySearch]);
  const mapCenter = useMemo(() => {
    if (selectedCountry && form.city) {
      const city = findCityInCountry(selectedCountry.code, form.city);
      if (city) return { lat: city.lat, lng: city.lng };
    }
    if (selectedCountry?.cities[0]) {
      return { lat: selectedCountry.cities[0].lat, lng: selectedCountry.cities[0].lng };
    }
    return undefined;
  }, [selectedCountry, form.city]);

  const handleCountryChange = (countryCode: string) => {
    const country = COUNTRIES.find((c) => c.code === countryCode);
    if (!country) return;
    const cityInNewCountry = findCityInCountry(countryCode, form.city);
    setForm((prev) => ({
      ...prev,
      country: country.name,
      city: cityInNewCountry ? prev.city : "",
    }));
    setCitySearch("");
  };

  const handleCityChange = (cityName: string) => {
    setForm((prev) => ({ ...prev, city: cityName }));
  };

  const { data: userResponse } = useFetch<UserApiResponse>(
    auth.username ? `${baseUrl}auth/getUser/${auth.username}` : "",
  );

  // Category names for the cart lines. Read-only, public endpoint, shared
  // app-wide cache namespace ("categories", 5 min) already used by the
  // products page — never a second request when the shopper browsed first.
  const { data: categoriesResponse } = useFetch<{
    data?: Array<{ _id: string; name: string }> | { categories?: Array<{ _id: string; name: string }> };
  }>(`${baseUrl}category/getAllCategories`, {
    cacheKey: "categories",
    staleTime: 5 * 60 * 1000,
  });
  const categoryNameById = useMemo(() => {
    const body = categoriesResponse?.data;
    const list = Array.isArray(body) ? body : body?.categories ?? [];
    const map = new Map<string, string>();
    list.forEach((c) => {
      if (c?._id) map.set(c._id, c.name || "");
    });
    return map;
  }, [categoriesResponse?.data]);

  useEffect(() => {
    const loadLocal = () => {
      const stored = getLocalCart();
      setCartItems((stored || []).map(normalizeCartItem).filter((i: any) => i._id));
    };
    const loadBackend = async () => {
      try {
        const localCart = getLocalCart();
        if (localCart.length > 0) {
          await axios.post(
            `${baseUrl}cart/sync`,
            {
              cartItems: localCart.map((i: any) => ({
                productId: i._id || i.id || i.productId || i.product?._id,
                quantity: i.quantity,
                selectedColor: i.selectedColor || i.color || i.variant?.color || "",
                selectedSize: i.selectedSize || i.size || i.variant?.size || "",
                customizationAnswers: i.customizationAnswers || [],
              })),
            },
            { withCredentials: true },
          );
          setLocalCart([]);
        }
        const res = await axios.get(`${baseUrl}cart/`, { withCredentials: true });
        const items = res.data.data.map((item: any) =>
          normalizeCartItem({
            _id: item.product._id,
            name: item.product.name,
            description: item.product.description,
            price: item.product.price,
            quantity: item.quantity,
            images: item.product.images,
            stock: item.product.stock,
            colors: item.product.colors,
            sizes: item.product.sizes,
            addedBy: item.product.addedBy,
            freeShipping: item.product.freeShipping ?? item.freeShipping ?? false,
            shippingCharge: item.product.shippingCharge ?? item.shippingCharge ?? 0,
            variantPricing: item.product.variantPricing || {},
            variantStock: item.product.variantStock || {},
            category: item.product.category,
            selectedColor: item.selectedColor || item.color,
            selectedSize: item.selectedSize || item.size,
            customizationAnswers: item.customizationAnswers || [],
            // Server-issued per-line address (product + variant + customization).
            cartItemKey: item.cartItemKey,
            customizable: item.product.customizable,
            // Carry the presentation inputs the admin configured on the
            // product so the customization form matches the product page
            // (previously dropped here, which forced the live-preview mode).
            showCustomizationPreview: item.product.showCustomizationPreview,
            customizationFields: item.product.customizationFields,
            printLayout: item.product.printLayout ?? null,
          }),
        );
        setCartItems(items.filter((i: any) => i._id));
      } catch { loadLocal(); }
    };
    setCartLoading(true);
    if (auth.username) {
      loadBackend().finally(() => setCartLoading(false));
    } else {
      loadLocal();
      setCartLoading(false);
    }
  }, [auth.username]);

  useEffect(() => {
    cartItems.forEach((item) => {
      if (prefilledItemsRef.current.has(item.lineKey)) return;
      const answers = item.customizationAnswers || [];
      if (!answers.length) return;
      const fields = item.customizationFields || [];
      const textMap: Record<string, string> = {};
      const prevMap: Record<string, string> = {};
      const urlAnswersMap: Record<string, string> = {};
      answers.forEach((a) => {
        const field = fields.find((f) => f.label === a.label);
        const key = field
          ? getFieldKey(field.fieldType, field.label)
          : `text|${a.label}`;
        const isImage = field?.fieldType === "image" || isImageUrlValue(a.value);
        if (isImage) {
          prevMap[key] = a.value;
          urlAnswersMap[key] = a.value;
        } else {
          textMap[key] = a.value;
        }
      });
      prefilledItemsRef.current.add(item.lineKey);
      if (Object.keys(textMap).length > 0 || Object.keys(urlAnswersMap).length > 0) {
        setCustomizationAnswers((prev) => ({
          ...prev,
          [item.lineKey]: {
            ...(prev[item.lineKey] || {}),
            ...textMap,
            ...urlAnswersMap,
          },
        }));
      }
      if (Object.keys(prevMap).length > 0) {
        setCustomizationPreviews((prev) => ({
          ...prev,
          [item.lineKey]: { ...(prev[item.lineKey] || {}), ...prevMap },
        }));
      }
    });
  }, [cartItems]);

  useEffect(() => {
    const items = cartItems
      .map((item) => {
        const answers: Array<{ label: string; value: string }> = [];
        for (const field of item.customizationFields || []) {
          const key = getFieldKey(field.fieldType, field.label);
          if (field.fieldType === "image") {
            const url = customizationPreviews[item.lineKey]?.[key];
            if (url && /^https?:\/\//.test(url)) {
              answers.push({ label: field.label, value: url });
            }
          } else {
            const val = sanitizePreviewText(customizationAnswers[item.lineKey]?.[key] || "");
            if (val) answers.push({ label: field.label, value: val });
          }
        }
        return { productId: item._id, answers };
      })
      .filter((i) => i.answers.length > 0);
    publishPreview({ items, updatedAt: Date.now() });
  }, [customizationAnswers, customizationPreviews, cartItems, publishPreview]);

  // Track the latest preview map so every blob: URL created for a preview is
  // released when the checkout page unmounts (no leaked object URLs).
  const previewsRef = useRef(customizationPreviews);
  previewsRef.current = customizationPreviews;
  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((map) =>
        Object.values(map).forEach(revokePreviewUrl),
      );
    };
  }, []);

  useEffect(() => {
    if (!auth.username) return;
    setForm((prev) => ({
      ...prev,
      fullName: prev.fullName || userResponse?.data?.username || auth.username || "",
      phoneNo: prev.phoneNo || (userResponse?.data?.phoneNo ? userResponse.data.phoneNo.toString() : auth.phoneNo ? auth.phoneNo.toString() : ""),
      address: prev.address || userResponse?.data?.address || "",
    }));
  }, [auth.username, auth.phoneNo, userResponse?.data]);

  useEffect(() => {
    if (!auth.username && typeof window !== "undefined") {
      const stored = localStorage.getItem("user");
      if (stored) { try { dispatch(loginSuccess(JSON.parse(stored) as any)); } catch (err) { console.error("[silent-catch page.tsx]", err); } }
    }
  }, [auth.username, dispatch]);

  useEffect(() => {
    if (!useSavedAddress || !userResponse?.data) return;
    setForm({
      fullName: userResponse.data.username || form.fullName,
      phoneNo: userResponse.data.phoneNo ? userResponse.data.phoneNo.toString() : form.phoneNo,
      address: userResponse.data.address || form.address,
      city: form.city,
      country: form.country,
    });
  }, [useSavedAddress, userResponse]);

  useEffect(() => {
    let cancelled = false;
    getShippingSettings().then((s) => {
      if (!cancelled) setShippingSettings(s);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${baseUrl}payment/methods`)
      .then((res) => {
        if (!cancelled && Array.isArray(res.data?.data)) {
          setAvailablePaymentMethods(res.data.data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const totals = useMemo(() => {
    const itemsPrice = cartItems.reduce((s, i) => s + resolveItemPrice(i) * i.quantity, 0);
    const shippingPrice = calculateCheckoutShipping(
      cartItems,
      itemsPrice,
      shippingSettings,
      form.city || "",
    );
    const totalAfterDiscount = Math.max(0, itemsPrice + shippingPrice);
    return { itemsPrice, shippingPrice, totalPrice: totalAfterDiscount };
  }, [cartItems, shippingSettings, form.city]);

  const { updateCart, removeItem } = useCartActions(
    cartItems,
    setCartItems,
    !!auth.username,
  );

  // Stable wrappers handed to the memoized item cards. `updateCart` /
  // `removeItem` only change identity when the cart itself changes, so the
  // cards are not re-rendered by unrelated state (e.g. typing the address).
  const handleQtyChange = useCallback(
    (itemId: string, quantity: number) => {
      void updateCart(itemId, quantity);
    },
    [updateCart],
  );
  const handleRemoveItem = useCallback(
    (itemId: string) => {
      void removeItem(itemId);
    },
    [removeItem],
  );

  const walletMaxUsage = Math.floor(
    (totals.itemsPrice * (referralOverview?.settings?.walletUsagePercent || 20)) / 100
  );
  const walletAvailable = Math.max(
    0,
    Math.min(referralOverview?.wallet?.balance || 0, walletMaxUsage, totals.totalPrice)
  );
  const walletRedeemAmount = useWallet ? walletAvailable : 0;
  const finalTotal = Math.max(0, totals.totalPrice - walletRedeemAmount);

  useEffect(() => {
    if (!auth.username) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${baseUrl}referral/overview`, { withCredentials: true });
        const ov = res.data?.data as ReferralOverview | undefined;
        if (cancelled || !ov) return;
        setReferralOverview(ov);
        if (ov.referral?.code && auth._id) {
          const acked =
            window.localStorage.getItem(referralAckKey(auth._id)) === "1";
          if (!acked) {
            setUnlockedCode(ov.referral.code);
            setShowUnlocked(true);
          }
        }
      } catch (err) { console.error("[silent-catch page.tsx]", err); }
    })();
    return () => { cancelled = true; };
  }, [auth.username, auth._id, baseUrl]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // F-016: debounce autosave so rapid typing doesn't write to sessionStorage
  // on every keystroke. A trailing-edge debounce with a short delay is enough
  // to cover fast typing while still guaranteeing the latest value persists
  // before the user navigates away.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(form), 400);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [form, save]);

  const handleVariantChange = useCallback(
    (itemId: string, field: "selectedColor" | "selectedSize", value: string) => {
      setCartItems((prev) => {
        const nextItems = prev.map((item) =>
          item.lineKey === itemId ? { ...item, [field]: value } : item,
        );
        if (!auth.username) setLocalCart(nextItems);
        return nextItems;
      });
    },
    [auth.username],
  );

  const handleLocationSelect = (loc: { address: string; lat: number; lng: number; city?: string }) => {
    setSelectedLocation(loc);
    setForm((prev) => ({
      ...prev,
      address: loc.address || prev.address,
      city: loc.city || prev.city,
    }));
  };

  const saveAddressToProfileIfMissing = async () => {
    const savedUserId = auth._id;
    if (!savedUserId) return;
    if (userResponse?.data?.address?.trim() || !form.address.trim()) return;
    try {
      await axios.put(`${baseUrl}auth/updateUser/${savedUserId}`, { address: form.address, phoneNo: form.phoneNo }, { withCredentials: true });
    } catch (err) { console.error("Could not save address:", err); }
  };

  const applyReferral = async () => {
    if (!referralCode.trim()) return;
    setReferralLoading(true);
    setReferralError("");
    try {
      const res = await axios.post(
        `${baseUrl}referral/validate`,
        { code: referralCode.trim(), itemsPrice: totals.itemsPrice, shippingPhone: form.phoneNo },
        { withCredentials: true },
      );
      const data = res.data?.data;
      if (data?.valid) {
        setAppliedReferral({ code: data.code, referrerName: data.referrerName, estimatedReward: data.estimatedReward });
        showToast(`Referral code applied — ${data.referrerName} earns ${formatPKR((data.estimatedReward || 0))} on delivery`, "success");
      } else {
        setReferralError(data?.reason || "Invalid referral code");
        setAppliedReferral(null);
      }
    } catch (err: any) {
      setReferralError(err?.response?.data?.message || "Failed to validate referral code");
      setAppliedReferral(null);
    } finally {
      setReferralLoading(false);
    }
  };

  const removeReferral = () => {
    setAppliedReferral(null);
    setReferralCode("");
    setReferralError("");
  };

  const uploadCustomizationImage = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await axios.post(`${baseUrl}cart/upload-customization-image`, formData, { withCredentials: true });
    return res.data.data.url;
  };

  const handleCustomizationChange = useCallback(
    (itemId: string, key: string, value: string) => {
      setCustomizationAnswers((prev) => ({
        ...prev,
        [itemId]: { ...(prev[itemId] || {}), [key]: value },
      }));
      setCustomizationErrors((prev) => prev.filter((e) => e !== key));
    },
    [],
  );

  const toggleRemoveBackground = useCallback((itemId: string, key: string) => {
    setRemoveBgFor((p) => ({
      ...p,
      [itemId]: {
        ...(p[itemId] || {}),
        [key]: !(p[itemId]?.[key] ?? false),
      },
    }));
  }, []);

  const handleCustomizationFileChange = useCallback(
    async (itemId: string, key: string, file: File | null) => {
      // `previewsRef` mirrors the latest preview map without making this
      // callback change identity on every preview update (it must stay stable
      // for the memoized item cards).
      if (file) {
        const check = validateImageFile(file);
        if (!check.ok) { showToast(check.error, "error"); return; }
        const optimized = await downscaleImageFile(check.file);
        setCustomizationFiles((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), [key]: optimized } }));
        // Revoke the preview we are replacing so blob URLs don't leak.
        revokePreviewUrl(previewsRef.current[itemId]?.[key]);
        setCustomizationPreviews((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), [key]: URL.createObjectURL(optimized) } }));
        setCustomizationAnswers((prev) => {
          const next = { ...(prev[itemId] || {}) };
          delete next[key];
          return { ...prev, [itemId]: next };
        });
      } else {
        revokePreviewUrl(previewsRef.current[itemId]?.[key]);
        setCustomizationFiles((prev) => { const next = { ...(prev[itemId] || {}) }; delete next[key]; return { ...prev, [itemId]: next }; });
        setCustomizationPreviews((prev) => { const next = { ...(prev[itemId] || {}) }; delete next[key]; return { ...prev, [itemId]: next }; });
        setCustomizationAnswers((prev) => { const next = { ...(prev[itemId] || {}) }; delete next[key]; return { ...prev, [itemId]: next }; });
      }
      setCustomizationErrors((prev) => prev.filter((e) => e !== key));
    },
    [],
  );

  const buildItemCustomizationAnswers = async (item: CartItem): Promise<Array<{ label: string; value: string }>> => {
    if (!item.customizable || !item.customizationFields?.length) return [];
    const answers: Array<{ label: string; value: string }> = [];
    for (const field of item.customizationFields) {
      const key = `${field.fieldType}|${field.label}`;
      const rawValue = customizationAnswers[item.lineKey]?.[key] || "";
      const file = customizationFiles[item.lineKey]?.[key] || null;
      if (field.fieldType === "image" && file) {
        setUploadingCustomization(true);
        try {
          const url = await uploadCustomizationImage(file);
          answers.push({ label: field.label, value: url });
        } catch (err: any) {
          showToast(err?.response?.data?.message || "Failed to upload customization image", "error");
          throw err;
        } finally {
          setUploadingCustomization(false);
        }
      } else if (rawValue.trim()) {
        answers.push({ label: field.label, value: rawValue.trim() });
      }
    }
    setCustomizationErrors([]);
    return answers;
  };

  const handlePlaceOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!auth.username) { dispatch(openLogin()); showToast("Please login before placing an order.", "error"); return; }
    const validItems = cartItems.filter((i) => i._id);
    if (validItems.length === 0) { showToast("Your cart is empty.", "error"); return; }
    if (!form.fullName.trim() || !form.phoneNo.trim() || !form.address.trim()) {
      showToast("Please complete all shipping fields.", "error"); return;
    }
    if (!selectedLocation || selectedLocation.lat == null || selectedLocation.lng == null) {
      showToast("Please select your delivery location on the map.", "error"); return;
    }
    if (selectedLocation.lat < -90 || selectedLocation.lat > 90 || selectedLocation.lng < -180 || selectedLocation.lng > 180) {
      showToast("Invalid location coordinates. Please re-select your location.", "error"); return;
    }
    if (!isValidPakistaniPhone(form.phoneNo)) {
      setPhoneError("Enter a valid Pakistani mobile number, e.g. 03001234567");
      showToast("Enter a valid Pakistani mobile number, e.g. 03001234567", "error");
      return;
    }
    setPhoneError("");
    const itemMissingVariant = validItems.find((item) =>
      (getVariantOptions(item.colors).length > 0 && !item.selectedColor) ||
      (getVariantOptions(item.sizes).length > 0 && !item.selectedSize),
    );
    if (itemMissingVariant) {
      showToast(`Choose the available color and size for ${itemMissingVariant.name}.`, "error");
      return;
    }
    setLoading(true);
    try {
      const orderItemsWithCustomization = await Promise.all(
        validItems.map(async (i) => {
          const answers = await buildItemCustomizationAnswers(i);
          return { product: i._id, quantity: i.quantity, selectedColor: i.selectedColor, selectedSize: i.selectedSize, customizationAnswers: answers };
        }),
      );
      const selectedMethod = availablePaymentMethods.find((m) => m.id === paymentMethod);
      const paymentMethodName = paymentMethod === "cod" ? "Cash on Delivery" : (selectedMethod?.name || "Cash on Delivery");
      const orderRes = await axios.post(
        `${baseUrl}order/createOrder`,
        {
          orderItems: orderItemsWithCustomization,
          shippingAddress: { ...form, latitude: selectedLocation.lat, longitude: selectedLocation.lng },
          paymentMethod: paymentMethodName,
          orderType,
          paymentStatus: "pending",
          itemsPrice: totals.itemsPrice,
          shippingPrice: totals.shippingPrice,
          totalPrice: finalTotal,
          referralCode: appliedReferral?.code || null,
          walletRedeemAmount,
          idempotencyKey: getCheckoutIdempotencyKey(),
        },
        { withCredentials: true },
      );
      const createdOrder = orderRes?.data?.data;
      if (createdOrder?._id) setPlacedOrderId(createdOrder._id);
      if (paymentMethod !== "cod" && createdOrder?._id) {
        try {
          const payRes = await axios.post(`${baseUrl}payment/initialize`, { orderId: createdOrder._id, provider: paymentMethod, phone: form.phoneNo }, { withCredentials: true });
          const payData = payRes.data?.data;
          if (payData?.gatewayUrl) { window.location.href = payData.gatewayUrl; return; }
        } catch (payErr: any) {
          showToast(payErr?.response?.data?.message || "Payment initialization failed. You can retry later.", "error");
        }
      }
      if (createdOrder?.referralUnlocked?.code) {
        setUnlockedCode(createdOrder.referralUnlocked.code);
        setShowUnlocked(true);
        if (redirectTimerRef.current) { clearTimeout(redirectTimerRef.current); redirectTimerRef.current = null; }
      }
      const selectedMethodName = availablePaymentMethods.find((m) => m.id === paymentMethod)?.name || "Cash on Delivery";
      const confirmationData = {
        orderId: createdOrder._id,
        serialNumber: createdOrder.serialNumber,
        items: (createdOrder.orderItems || []).map((oi: any) => ({
          name: oi.productName || oi.product?.name || "",
          quantity: oi.quantity,
          unitPrice: oi.unitPrice || 0,
          selectedColor: oi.selectedColor,
          selectedSize: oi.selectedSize,
          productImage: oi.productImage || oi.product?.images?.[0]?.url,
        })),
        itemsPrice: createdOrder.itemsPrice || totals.itemsPrice,
        shippingPrice: createdOrder.shippingPrice || totals.shippingPrice,
        discountAmount: createdOrder.discountAmount || 0,
        totalPrice: createdOrder.totalPrice || finalTotal,
        paymentMethod: selectedMethodName,
        shippingAddress: { fullName: form.fullName, city: form.city, country: form.country },
      };
      setCartItems([]);
      setOrderPlaced(true);
      setConfirmationOrder(confirmationData);
      setShowConfirmation(true);
      playOrderSound();
      try {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ["#C9A227", "#1B2027", "#FFFFFF", "#E8C86E"] });
        setTimeout(() => confetti({ particleCount: 40, spread: 90, origin: { y: 0.65, x: 0.4 }, colors: ["#C9A227", "#B08D1F"] }), 300);
        setTimeout(() => confetti({ particleCount: 40, spread: 90, origin: { y: 0.65, x: 0.6 }, colors: ["#C9A227", "#B08D1F"] }), 450);
      } catch (err) { console.error("[silent-catch page.tsx]", err); }
      if (typeof window !== "undefined") window.dispatchEvent(new Event("cart-updated"));
      if (typeof window !== "undefined") sessionStorage.removeItem(CHECKOUT_IDEMPOTENCY_KEY);
      try {
        await saveAddressToProfileIfMissing();
        clear();
        if (typeof window !== "undefined") localStorage.removeItem("irhasinn_cart");
      } catch (cleanupErr) {
        console.warn("Post-order cleanup skipped:", cleanupErr);
      }
      showToast("Order placed successfully!", "success", "light");
    } catch (error: any) {
      showToast(error?.response?.data?.message || error?.message || "Unable to place order.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface-page pb-14">
      {/* Continuous premium multicolor accent — pure CSS animation (no JS, no
          timers, no React state), so it can never trigger a re-render. */}
      <div className="ir-checkout-accent h-[3px] w-full" aria-hidden="true" />

      <div className="max-w-[1120px] mx-auto px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">

        {/* Header */}
        <header className="mb-6 sm:mb-7">
          <h1 className="sr-only">Checkout</h1>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LogoLockup compact />
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-navy shadow-[0_1px_2px_rgba(34,40,49,0.04)]">
              <Shield size={14} className="text-state-success" />
              Secure Checkout
            </span>
          </div>
          <StepIndicator
            steps={[{ label: "Shipping" }, { label: "Payment" }, { label: "Review & Place Order" }]}
            currentStep={0}
            ariaLabel="Checkout progress"
            className="mt-6 sm:mt-7"
          />
        </header>

        {orderPlaced ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-2xl border border-line bg-surface text-center shadow-sm"
          >
            <div className="ir-checkout-accent h-[3px] w-full" aria-hidden="true" />
            <div className="p-12">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-state-success">
                <CheckCircle className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-black text-brand-navy">Order Placed!</h2>
              <p className="mt-2 text-sm font-medium text-ink-muted">Redirecting to homepage…</p>
            </div>
          </motion.div>
        ) : cartLoading ? (
          /* Skeleton — matches the final layout so there is no jump and no
             misleading "empty cart" flash while the cart resolves. */
          <div
            className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:gap-8"
            aria-busy="true"
            aria-label="Loading checkout"
          >
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="h-32 animate-pulse rounded-2xl border border-line bg-surface" />
                <div className="h-32 animate-pulse rounded-2xl border border-line bg-surface" />
              </div>
              <div className="h-72 animate-pulse rounded-2xl border border-line bg-surface" />
            </div>
            <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />
          </div>
        ) : cartItems.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-2xl border border-line bg-surface text-center shadow-sm"
          >
            <div className="ir-checkout-accent h-[3px] w-full" aria-hidden="true" />
            <div className="p-12">
              <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-page">
                <XCircle className="h-8 w-8 text-ink-muted" />
              </div>
              <h2 className="text-2xl font-black text-brand-navy">Your cart is empty</h2>
              <p className="mt-2 text-sm font-medium text-ink-muted">
                Add a product to continue to checkout.
              </p>
              <motion.button type="button" onClick={() => router.push("/")} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className="ir-btn-primary mt-8 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-brand-gold px-6 py-3 text-sm font-bold text-brand-navy transition hover:bg-brand-gold-hover"
              >
                <ShoppingCart size={16} /> Browse products
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut", delay: 0.1 }}
              className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:gap-8"
            >
              {/* PRIMARY — review the items (and fill in any customization),
                  then the delivery details. */}
              <div className="space-y-6">
                <section className="space-y-4" aria-labelledby="checkout-items-heading">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <SectionLabel>Your Order</SectionLabel>
                      <h2 id="checkout-items-heading" className="mt-1 text-lg font-bold text-brand-navy">
                        {cartItems.length} {cartItems.length === 1 ? "item" : "items"}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push("/cart")}
                      className="text-xs font-semibold text-ink-muted transition hover:text-brand-gold-hover"
                    >
                      Edit cart
                    </button>
                  </div>

                  {/* One cohesive card per line: preview · identity · variant ·
                      customization · quantity · price. Memoized so unrelated
                      parent state (e.g. typing the address) never re-renders
                      the preview canvases. */}
                  <div className="space-y-4">
                    {cartItems.map((item) => (
                      <CheckoutItemCard
                        key={item.lineKey}
                        item={item}
                        categoryName={resolveCategoryName(item, categoryNameById)}
                        answers={customizationAnswers[item.lineKey]}
                        previews={customizationPreviews[item.lineKey]}
                        files={customizationFiles[item.lineKey]}
                        removeBg={removeBgFor[item.lineKey]}
                        onVariantChange={handleVariantChange}
                        onCustomizationChange={handleCustomizationChange}
                        onCustomizationFileChange={handleCustomizationFileChange}
                        onToggleRemoveBackground={toggleRemoveBackground}
                        onQuantityChange={handleQtyChange}
                        onRemove={handleRemoveItem}
                      />
                    ))}
                  </div>
                </section>

                <div className="overflow-hidden rounded-2xl bg-surface border border-line shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 pt-5 sm:pt-7 pb-5 border-b border-line">
                    <div>
                      <SectionLabel>Shipping</SectionLabel>
                      <h2 className="mt-1 text-lg font-bold text-brand-navy">Delivery Details</h2>
                    </div>
                    <button type="button" onClick={() => { if (!auth.username) { dispatch(openLogin()); showToast("Login required.", "info"); return; } setUseSavedAddress((p) => !p); }}
                      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[11px] font-bold transition-all ${useSavedAddress ? "bg-brand-gold text-brand-navy shadow-sm shadow-brand-gold/20" : "bg-surface text-ink-muted border border-line hover:border-brand-gold/40 hover:text-brand-navy"}`}
                    >
                      <MapPin size={14} />
                      {useSavedAddress ? "Saved address" : "Use saved address"}
                    </button>
                  </div>
                  <form id="checkout-form" onSubmit={handlePlaceOrder} className="p-5 sm:p-7 space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                          Full Name <span className="text-state-danger">*</span>
                        </span>
                        <input name="fullName" value={form.fullName} onChange={handleInputChange} placeholder="Recipient name" autoComplete="name"
                          className="min-h-12 w-full rounded-xl border border-line bg-surface-page px-4 py-3 text-sm font-medium text-brand-navy placeholder:text-ink-subtle outline-none transition-all duration-200 hover:border-brand-gold/40 focus:border-brand-gold focus:bg-surface focus:ring-2 focus:ring-brand-gold/15" />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                          Phone Number <span className="text-state-danger">*</span>
                        </span>
                        <input name="phoneNo" value={form.phoneNo}
                          onChange={(e) => { handleInputChange(e); if (phoneError) setPhoneError(""); }}
                          placeholder="03XX-XXXXXXX" inputMode="tel" autoComplete="tel" aria-invalid={!!phoneError}
                          className={`min-h-12 w-full rounded-xl border bg-surface-page px-4 py-3 text-sm font-medium text-brand-navy placeholder:text-ink-subtle outline-none transition-all duration-200 hover:border-brand-gold/40 focus:border-brand-gold focus:bg-surface focus:ring-2 focus:ring-brand-gold/15 ${phoneError ? "border-state-danger" : "border-line"}`} />
                        {phoneError && <p className="text-[11px] font-medium text-state-danger">{phoneError}</p>}
                      </label>
                    </div>
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                        Full Address <span className="text-state-danger">*</span>
                      </span>
                      <textarea name="address" value={form.address} onChange={handleInputChange} placeholder="House / street, landmark, area" rows={3} autoComplete="street-address"
                        className="w-full resize-none rounded-xl border border-line bg-surface-page px-4 py-3 text-sm font-medium text-brand-navy placeholder:text-ink-subtle outline-none transition-all duration-200 hover:border-brand-gold/40 focus:border-brand-gold focus:bg-surface focus:ring-2 focus:ring-brand-gold/15" />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">Country</span>
                        <SearchableSelect options={countryOptions} value={selectedCountry?.code || ""} onChange={handleCountryChange} placeholder="Select country" />
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                          City <span className="text-state-danger">*</span>
                        </span>
                        <SearchableSelect options={cityOptions} value={form.city || ""} onChange={handleCityChange}
                          placeholder={selectedCountry ? "Select city" : "Select country first"} disabled={!selectedCountry} emptyMessage="No cities found" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                        Delivery Location <span className="text-state-danger">*</span>
                      </span>
                      <p className="text-[10px] font-medium text-ink-subtle">
                        Required for delivery — select your exact location on the map
                      </p>
                      <LocationPicker onLocationSelect={handleLocationSelect} defaultCenter={mapCenter} />
                      {selectedLocation ? (
                        <p className="flex items-center gap-1 text-[10px] font-bold text-state-success">
                          <CheckCircle size={12} /> Location confirmed
                        </p>
                      ) : (
                        <p className="text-[10px] font-semibold text-state-danger">
                          No location selected yet
                        </p>
                      )}
                    </div>

                    {/* Payment Method */}
                    <div className="space-y-3">
                      <SectionLabel>Payment Method</SectionLabel>
                      <div className="grid gap-2" role="group" aria-label="Payment method">
                        {availablePaymentMethods.filter((m) => m.available).map((method) => {
                          const selected = paymentMethod === method.id;
                          return (
                            <button key={method.id} type="button" onClick={() => setPaymentMethod(method.id)}
                              aria-pressed={selected}
                              className={`w-full flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                                selected
                                  ? "border-brand-gold bg-brand-gold/[0.06] ring-1 ring-brand-gold/30"
                                  : "border-line bg-surface hover:border-brand-gold/40"
                              }`}
                            >
                              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${selected ? "bg-brand-gold text-brand-navy" : "bg-surface-page text-ink-muted"}`}>
                                <CreditCard size={16} />
                              </span>
                              <span className="flex-1 min-w-0 text-sm font-bold text-brand-navy">{method.name}</span>
                              {selected && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-gold/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-gold-strong">
                                  <CheckCircle size={10} /> Selected
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-ink-muted">
                        <span className="inline-flex items-center gap-1">
                          <Shield size={11} className="text-state-success" /> 256-bit SSL encrypted
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <BadgeCheck size={11} className="text-state-success" /> Guaranteed safe checkout
                        </span>
                      </p>
                    </div>

                    <div className="space-y-3 pt-1">
                      <motion.button type="submit" disabled={loading}
                        whileHover={{ scale: loading ? 1 : 1.005, y: loading ? 0 : -1 }}
                        whileTap={{ scale: 0.985 }}
                        className="relative hidden w-full overflow-hidden rounded-xl bg-brand-gold py-4 min-h-[56px] text-sm font-bold uppercase tracking-[0.15em] text-brand-navy shadow-md shadow-brand-gold/20 transition-all duration-200 hover:bg-brand-gold-hover hover:shadow-lg hover:shadow-brand-gold/25 disabled:cursor-not-allowed disabled:opacity-50 lg:block"
                      >
                        {/* Continuous light sweep — CSS only (composited). */}
                        <span className="ir-checkout-sheen" aria-hidden="true" />
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          {loading ? (
                            <>
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
                              </svg>
                              Placing order…
                            </>
                          ) : (
                            <>
                              Place Order
                              <ChevronRight size={16} />
                            </>
                          )}
                        </span>
                      </motion.button>
                      <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-ink-muted">
                        <Shield size={12} className="text-state-success" />
                        Secure order — your details are only used for delivery
                      </p>
                    </div>
                  </form>
                </div>
              </div>

              {/* RIGHT: Order Summary — a compact, stable visual anchor.
                  The full product + customization cards live in the primary
                  column; this recap deliberately uses plain thumbnails (no
                  second canvas preview) so the summary stays cheap to render
                  and short enough to remain sticky. */}
              <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
                {/* Admin-toggled free-shipping progress — renders nothing when
                    the feature is off, so the gating is untouched. */}
                <FreeShippingProgressBar items={cartItems} subtotal={totals.itemsPrice} />

                <div className="overflow-hidden rounded-2xl bg-surface border border-line shadow-sm">
                  <div className="ir-checkout-accent h-[3px] w-full" aria-hidden="true" />
                  {/* Below `lg` this header collapses the breakdown — the
                      collapsed state already answers "how many items / how
                      much do I pay". At `lg`+ the body is always expanded
                      (lg:block), so the desktop summary is unchanged. */}
                  <button
                    type="button"
                    onClick={() => setSummaryOpen((o) => !o)}
                    aria-expanded={summaryOpen}
                    aria-controls="checkout-summary-body"
                    className="flex w-full items-center justify-between gap-3 border-b border-line px-5 pt-5 pb-4 text-left transition-colors hover:bg-surface-muted/50 lg:cursor-default lg:hover:bg-transparent"
                  >
                    <span className="min-w-0">
                      <SectionLabel>Summary</SectionLabel>
                      <span className="mt-1 block text-lg font-bold text-brand-navy">
                        {cartItems.length} {cartItems.length === 1 ? "item" : "items"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 lg:hidden">
                      <span className="text-base font-black tabular-nums text-brand-navy">
                        {formatPKR(finalTotal)}
                      </span>
                      <ChevronRight
                        size={16}
                        aria-hidden="true"
                        className={`text-ink-muted transition-transform duration-200 ${summaryOpen ? "rotate-90" : ""}`}
                      />
                    </span>
                  </button>

                  <div id="checkout-summary-body" className={`${summaryOpen ? "block" : "hidden"} lg:block`}>
                  <ul className="divide-y divide-line">
                    {cartItems.map((item) => {
                      const itemAnswers = customizationAnswers[item.lineKey] || {};
                      const itemPreviews = customizationPreviews[item.lineKey] || {};
                      const personalized =
                        item.customizable === true &&
                        (Object.values(itemAnswers).some(Boolean) ||
                          Object.values(itemPreviews).some(Boolean));
                      const unit = resolveItemPrice(item);
                      const variantText = [item.selectedColor, item.selectedSize]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <li key={item.lineKey} className="flex items-center gap-3 px-5 py-3">
                          <img
                            src={cloudinaryUrl(item.images?.[0]?.url, 100) || "/carousel/Clothes.jpg"}
                            alt={item.name}
                            loading="lazy"
                            decoding="async"
                            className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-line"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-brand-navy">
                              {item.name}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] font-medium text-ink-muted">
                              {item.quantity} ×{" "}
                              {unit > 0 ? `${formatPKR(unit)}` : "Select options"}
                              {variantText ? ` · ${variantText}` : ""}
                              {personalized ? " · Personalized" : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-bold tabular-nums text-brand-navy">
                            {unit > 0 ? `${formatPKR((unit * item.quantity))}` : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Referral — hidden when the admin has paused the program
                      (referralOverview.programEnabled === false). While the
                      overview is still loading the block keeps its previous
                      behaviour and stays visible. */}
                  {auth.username && referralOverview?.programEnabled !== false && (
                    <div className="border-t border-line px-5 py-4">
                      <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
                        <Gift size={12} className="text-brand-gold" /> Have a referral code?
                      </p>
                      {appliedReferral ? (
                        <div className="flex items-center justify-between rounded-xl border border-brand-gold/30 bg-brand-gold/[0.07] px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <Gift size={14} className="text-brand-gold" />
                            <div>
                              <span className="text-sm font-bold text-brand-navy">{appliedReferral.code}</span>
                              <span className="ml-2 text-xs text-ink-muted">via {appliedReferral.referrerName}</span>
                            </div>
                          </div>
                          <button type="button" onClick={removeReferral} className="rounded-full p-1 transition hover:bg-brand-gold/20" aria-label="Remove referral code">
                            <X size={14} className="text-brand-navy" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-0">
                          <input type="text" value={referralCode}
                            onChange={(e) => { setReferralCode(e.target.value.toUpperCase()); setReferralError(""); }}
                            placeholder="IRHAS-XXXXX" aria-label="Referral code"
                            className="flex-1 min-h-[42px] rounded-l-xl border border-line border-r-0 bg-surface px-3.5 py-2.5 text-xs font-semibold uppercase text-brand-navy outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/10 placeholder:normal-case" />
                          <button type="button" onClick={applyReferral} disabled={referralLoading || !referralCode.trim()}
                            className="min-h-[42px] rounded-r-xl bg-brand-gold px-5 py-2.5 text-xs font-bold text-brand-navy transition hover:bg-brand-gold-hover disabled:opacity-40">
                            {referralLoading ? "..." : "Apply"}
                          </button>
                        </div>
                      )}
                      {referralError && <p className="mt-1.5 text-xs font-semibold text-state-danger">{referralError}</p>}
                    </div>
                  )}

                  {/* Wallet */}
                  {auth.username && (referralOverview?.wallet?.balance || 0) > 0 && (
                    <div className="border-t border-line px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-navy">
                            <Wallet size={12} className="text-brand-gold" /> Referral Wallet
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            Balance: <span className="font-bold text-brand-navy">{formatPKR((referralOverview?.wallet?.balance || 0))}</span>
                          </p>
                        </div>
                        <button type="button" onClick={() => setUseWallet((p) => !p)} disabled={walletAvailable <= 0} aria-pressed={useWallet}
                          aria-label="Use referral wallet balance"
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${useWallet ? "bg-brand-gold" : "bg-[#E5E7EB]"} disabled:cursor-not-allowed disabled:opacity-40`}>
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${useWallet ? "left-[22px]" : "left-0.5"}`} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Totals — itemised lines first, then ONE dominant payable
                      total so the amount is impossible to hunt for. The shared
                      PriceSummary keeps its own <Total> row for other pages
                      (track-order), hence showTotal={false} here. */}
                  <div className="border-t border-line bg-surface-muted/50 px-5 py-5">
                    <PriceSummary
                      subtotal={totals.itemsPrice}
                      shipping={totals.shippingPrice}
                      total={finalTotal}
                      showTotal={false}
                    />
                    {walletRedeemAmount > 0 && (
                      <div className="mt-2.5 flex items-center justify-between text-sm">
                        <span className="font-semibold text-state-danger">Referral Wallet</span>
                        <span className="font-bold tabular-nums text-state-danger">− {formatPKR(walletRedeemAmount)}</span>
                      </div>
                    )}
                    <div className="mt-4 border-t border-brand-navy/10 pt-3.5">
                      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                          Total payable
                        </span>
                        <span className="text-2xl font-black leading-none tabular-nums text-brand-navy">
                          {formatPKR(finalTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
                <button type="button" onClick={() => router.push("/cart")}
                  className="w-full text-center text-sm font-semibold text-ink-muted transition hover:text-brand-gold-hover">
                  ← Back to Cart
                </button>
              </aside>
            </motion.div>

            {/* Mobile-only (< lg) sticky action bar: payable total + the
                single Place Order CTA. It is `sticky` (not `fixed`) and lives
                in normal flow, offset above the MobileBottomNav, so it can
                never cover a form field, the footer, or the mobile nav — and
                needs no viewport padding hacks. The button submits the real
                form by id, so it runs the exact same onSubmit handler with no
                duplicated order logic. */}
            <div className="sticky bottom-[72px] z-30 mt-6 md:bottom-4 lg:hidden">
              <div className="overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-[0_8px_24px_rgba(34,40,49,0.12)] backdrop-blur">
                <div className="ir-checkout-accent h-[3px] w-full" aria-hidden="true" />
                <div className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                      Total payable
                    </p>
                    <p className="truncate text-lg font-black leading-tight tabular-nums text-brand-navy">
                      {formatPKR(finalTotal)}
                    </p>
                  </div>
                  <button
                    type="submit"
                    form="checkout-form"
                    disabled={loading}
                    className="inline-flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-xl bg-brand-gold px-5 text-sm font-bold text-brand-navy shadow-sm transition hover:bg-brand-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
                        </svg>
                        Placing…
                      </>
                    ) : (
                      <>
                        Place Order
                        <ChevronRight size={16} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <ReferralUnlockedModal open={showUnlocked} code={unlockedCode} onClose={() => {
        if (auth._id) window.localStorage.setItem(referralAckKey(auth._id), "1");
        setShowUnlocked(false);
      }} />

      <ConfirmationModal open={showConfirmation} orderId={confirmationOrder?.orderId || null} serialNumber={confirmationOrder?.serialNumber}
        items={confirmationOrder?.items || []} itemsPrice={confirmationOrder?.itemsPrice || 0}
        shippingPrice={confirmationOrder?.shippingPrice || 0} discountAmount={confirmationOrder?.discountAmount || 0}
        totalPrice={confirmationOrder?.totalPrice || 0} paymentMethod={confirmationOrder?.paymentMethod || "Cash on Delivery"}
        shippingAddress={confirmationOrder?.shippingAddress || { fullName: "", city: "", country: "" }}
        onClose={() => setShowConfirmation(false)}
        onContinueShopping={() => { setShowConfirmation(false); router.push("/"); }}
        onChat={() => { setShowConfirmation(false); if (confirmationOrder?.orderId) { router.push(`/chat?order=${confirmationOrder.orderId}&from=checkout`); } else { router.push("/chat"); } }}
      />
    </main>
  );
};

export default CheckoutPage;
