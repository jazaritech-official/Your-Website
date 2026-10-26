"use client";
import { formatPKR } from "@/app/utils/format";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import dynamic from "next/dynamic";
import { AlertTriangle, Info, MapPin, X } from "lucide-react";
import {
  baseUrl,
  isValidPakistaniPhone,
  showToast,
} from "@/app/utils/commonFunctions";
import { Button, Field, TextInput, fieldStyles } from "@/app/Components/ui";
import SearchableSelect from "@/app/Components/checkout/SearchableSelect";
import { findCountryByName, searchCities } from "@/app/utils/countries";

/** Mirrors the server's `shippingChange` payload (utils/shipping.js). */
interface ShippingChange {
  cityChanged: boolean;
  fromCity: string;
  toCity: string;
  from: number;
  to: number;
  difference: number;
  blocked: boolean;
  reason: string;
}

/*
 * The Google Maps picker is heavy, so it is loaded on demand exactly like
 * checkout and OrderLiveTracking do — the modal shell renders first and the map
 * streams in.
 */
const LocationPicker = dynamic(
  () => import("@/app/Components/LocationPicker"),
  { ssr: false },
);

export interface ChangeLocationShippingAddress {
  fullName?: string;
  phoneNo?: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

interface ChangeLocationModalProps {
  orderId: string;
  /** The order's CURRENT saved shipping address (pre-filled into the form). */
  shippingAddress?: ChangeLocationShippingAddress;
  /** Called with the server's updated order after a successful save. */
  onSaved: (updatedOrder: unknown) => void;
  /** Called on failure so the page can re-sync reality (status may have changed). */
  onRefresh: () => void;
  onClose: () => void;
}

/** Loose city comparison — Nominatim returns "Karachi", "Karachi Division",
 *  "Malir", etc. for the same metro area, so we only flag an obvious
 *  mismatch rather than blocking a legitimate move within the city. */
const normalizeCity = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

const ChangeLocationModal = ({
  orderId,
  shippingAddress,
  onSaved,
  onRefresh,
  onClose,
}: ChangeLocationModalProps) => {
  const initialCity = (shippingAddress?.city || "").trim();
  const lockedCountry = (shippingAddress?.country || "Pakistan").trim();

  const [fullName, setFullName] = useState(shippingAddress?.fullName || "");
  const [phoneNo, setPhoneNo] = useState(shippingAddress?.phoneNo || "");
  const [address, setAddress] = useState(shippingAddress?.address || "");
  const [phoneError, setPhoneError] = useState("");

  // Coordinates currently selected in the picker. Seeded from the order's saved
  // pin so nothing changes unless the customer actually moves it.
  const [lat, setLat] = useState<number | null>(
    shippingAddress?.latitude ?? null,
  );
  const [lng, setLng] = useState<number | null>(
    shippingAddress?.longitude ?? null,
  );
  const [pinCity, setPinCity] = useState("");

  /*
   * The delivery city IS editable now. Shipping was priced from the original
   * city, so a change is re-priced server-side through the SAME calculator
   * checkout uses — and the customer must confirm the resulting fee change
   * before it is applied.
   */
  const [city, setCity] = useState(initialCity);
  /* Populated by the dry-run response when confirming an actual fee change. */
  const [pendingChange, setPendingChange] = useState<ShippingChange | null>(null);
  const [checking, setChecking] = useState(false);

  const [saving, setSaving] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  /* Escape closes; the first field takes focus on open. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    firstFieldRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /* Reuse the EXACT checkout picker contract: reverse-geocoded address fills
     the address field, and the pin's coordinates are captured. */
  const handleLocationSelect = (loc: {
    address: string;
    lat: number;
    lng: number;
    city?: string;
  }) => {
    setLat(loc.lat);
    setLng(loc.lng);
    setPinCity(loc.city || "");
    if (loc.address) setAddress(loc.address);
  };

  const hasStoredPin =
    shippingAddress?.latitude != null && shippingAddress?.longitude != null;
  const initialPosition =
    hasStoredPin
      ? { lat: shippingAddress!.latitude!, lng: shippingAddress!.longitude! }
      : null;

  /*
   * SearchableSelect filters internally, so the full city list for the order's
   * country is handed over once (no query state to keep in sync here).
   */
  const cityOptions = useMemo(() => {
    const code = findCountryByName(lockedCountry)?.code;
    if (!code) return [];
    return searchCities(code, "").map((c) => ({
      label: c.name,
      value: c.name,
    }));
  }, [lockedCountry]);

  /*
   * The pin's city is only a HINT — it pre-fills the editable city field so a
   * customer who drops the pin in another city doesn't have to retype it, but
   * the value that gets sent is always what's in the field.
   */
  const pinSuggestsAnotherCity =
    Boolean(pinCity) &&
    Boolean(city) &&
    !normalizeCity(pinCity).includes(normalizeCity(city)) &&
    !normalizeCity(city).includes(normalizeCity(pinCity));

  const busy = saving || checking;

  /** Shared request body — the city is the customer's chosen value. */
  const buildPayload = () => ({
    shippingAddress: {
      fullName: fullName.trim(),
      phoneNo: phoneNo.trim(),
      address: address.trim(),
      city: city.trim() || undefined,
      country: lockedCountry || undefined,
      ...(lat != null ? { latitude: lat } : {}),
      ...(lng != null ? { longitude: lng } : {}),
    },
  });

  /** Validation shared by both phases. */
  const validate = () => {
    if (!fullName.trim() || !phoneNo.trim() || !address.trim()) {
      showToast("Please complete all delivery fields.", "error");
      return false;
    }
    if (!isValidPakistaniPhone(phoneNo)) {
      setPhoneError("Enter a valid Pakistani mobile number, e.g. 03001234567");
      showToast(
        "Enter a valid Pakistani mobile number, e.g. 03001234567",
        "error",
      );
      return false;
    }
    setPhoneError("");
    return true;
  };

  /** The server's message when it has one, otherwise our fallback. */
  const serverMessageFrom = (err: unknown, fallback: string) =>
    axios.isAxiosError(err) &&
    typeof err.response?.data?.message === "string"
      ? err.response.data.message
      : fallback;

  /*
   * Phase 1 — DRY RUN.
   * Asks the server what this change would cost WITHOUT applying anything, so
   * the figure the customer confirms is the server's own calculation (the same
   * function checkout uses) and never a client-side estimate.
   */
  const handleCheck = async () => {
    if (busy || !validate()) return;
    setChecking(true);
    try {
      const res = await axios.patch(
        `${baseUrl}order/${orderId}/location`,
        { ...buildPayload(), dryRun: true },
        { withCredentials: true },
      );
      const change: ShippingChange | null =
        res.data?.data?.shippingChange ?? null;

      // Same city, or a different city with an identical fee → no money impact,
      // so save straight away exactly as before.
      if (!change || !change.cityChanged || change.difference === 0) {
        await applyChange();
        return;
      }

      // Already settled online: the server refuses to re-price, so tell the
      // customer why instead of letting them commit to a doomed save.
      if (change.blocked) {
        showToast(change.reason, "error");
        return;
      }

      setPendingChange(change);
    } catch (err: unknown) {
      showToast(
        serverMessageFrom(err, "Could not check the new delivery city"),
        "error",
      );
      onRefresh();
    } finally {
      setChecking(false);
    }
  };

  /*
   * Phase 2 — the real save. Also used directly when the dry run reported no
   * fee change. Re-sends the full address, so the request is self-contained.
   */
  const applyChange = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await axios.patch(
        `${baseUrl}order/${orderId}/location`,
        buildPayload(),
        { withCredentials: true },
      );
      showToast("Delivery location updated", "success");
      onSaved(res.data?.data ?? null);
      onClose();
    } catch (err: unknown) {
      // Most likely the order left the changeable window while the modal was
      // open (admin assigned a rider / marked it Shipped). Surface the server's
      // reason and re-sync the page so the UI reflects the real state.
      showToast(
        serverMessageFrom(err, "Could not update the delivery location"),
        "error",
      );
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  /*
   * Rendered through a portal to <body>. The order detail page wraps its
   * content in `.ir-fade-in-up`, and that animation uses
   * `animation-fill-mode: both` — so a `transform` stays applied forever and
   * the wrapper becomes the containing block for `position: fixed` children.
   * Portalling keeps this dialog anchored to the real viewport instead of to
   * that 3xl-wide column.
   */
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-navy/45 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-location-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="my-auto w-full max-w-lg rounded-sheet bg-surface p-6 shadow-sheet">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="change-location-title"
              className="flex items-center gap-2 text-lg font-bold text-brand-navy"
            >
              <MapPin size={18} aria-hidden className="text-brand-gold" />
              Change Delivery Location
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              Move the pin or correct the address for this order.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field text-ink-muted transition-colors hover:bg-surface-muted hover:text-brand-navy disabled:opacity-50"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="space-y-4">
          {/*
            Delivery city — EDITABLE. Shipping is re-priced from whatever city
            is selected here, so a change to a city with a different fee is
            shown for confirmation before it is applied (see below).
          */}
          {/*
            Inline label rather than <Field>: SearchableSelect renders its own
            combobox and takes no id, so a <label htmlFor> would dangle. This is
            the exact pattern checkout already uses for the same control.
          */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              Delivery city{lockedCountry ? ` (${lockedCountry})` : ""}
            </span>
            <SearchableSelect
              options={cityOptions}
              value={city}
              onChange={(value) => {
                setCity(value);
                // A new city invalidates any confirmation already on screen.
                setPendingChange(null);
              }}
              placeholder="Select delivery city"
              disabled={busy || pendingChange !== null}
              emptyMessage="No cities found"
            />
          </div>

          {/* Map picker — mirrors checkout exactly. */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              Delivery location
            </span>
            <p className="text-[10px] font-medium text-ink-subtle">
              {initialPosition
                ? "Your saved pin is shown below — drag it or search to move it."
                : "Select your exact location on the map."}
            </p>
            <LocationPicker
              onLocationSelect={handleLocationSelect}
              initialPosition={initialPosition}
            />
            {lat != null && lng != null && (
              <p className="flex items-center gap-1 text-[10px] font-bold text-state-success">
                <Info size={12} aria-hidden /> Location set (
                {lat.toFixed(4)}, {lng.toFixed(4)})
              </p>
            )}
          </div>

          {pinSuggestsAnotherCity && !pendingChange && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-field border border-state-warning/40 bg-state-warning/10 px-3 py-2.5"
            >
              <AlertTriangle
                size={14}
                aria-hidden
                className="mt-0.5 shrink-0 text-state-warning"
              />
              <p className="text-xs font-medium text-brand-navy">
                This pin looks like it is in <strong>{pinCity}</strong>, but the
                delivery city is set to <strong>{city || "—"}</strong>. Update
                the city above if the pin is correct — that may change the
                shipping fee.
              </p>
            </div>
          )}

          {/*
            Explicit, SEPARATE confirmation of the fee change. Nothing has been
            saved at this point — the dry run only reported what the server
            would charge.
          */}
          {pendingChange && (
            <div
              role="alertdialog"
              aria-labelledby="cl-fee-change-title"
              className="rounded-field border border-brand-gold/45 bg-brand-gold/10 px-3.5 py-3"
            >
              <p
                id="cl-fee-change-title"
                className="text-xs font-bold uppercase tracking-[0.12em] text-brand-navy"
              >
                Shipping fee will change
              </p>
              <p className="mt-1.5 text-xs font-medium text-brand-navy">
                Changing to <strong>{pendingChange.toCity}</strong> updates your
                shipping fee from {formatPKR(pendingChange.from)} to Rs{" "}
                {pendingChange.to.toLocaleString()}{" "}
                <strong>
                  ({pendingChange.difference > 0 ? "+" : "−"}Rs{" "}
                  {Math.abs(pendingChange.difference).toLocaleString()})
                </strong>
                . Do you want to continue?
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => setPendingChange(null)}
                >
                  Keep {pendingChange.fromCity || "current city"}
                </Button>
                <Button
                  variant="gold"
                  size="sm"
                  className="flex-1"
                  loading={saving}
                  disabled={busy}
                  onClick={applyChange}
                >
                  Confirm &amp; Save
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recipient name" htmlFor="cl-fullName" required>
              <TextInput
                id="cl-fullName"
                ref={firstFieldRef}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Recipient name"
                autoComplete="name"
                disabled={saving}
              />
            </Field>
            <Field
              label="Phone number"
              htmlFor="cl-phoneNo"
              required
              error={phoneError}
            >
              <TextInput
                id="cl-phoneNo"
                value={phoneNo}
                onChange={(e) => {
                  setPhoneNo(e.target.value);
                  if (phoneError) setPhoneError("");
                }}
                placeholder="03XXXXXXXXX"
                inputMode="tel"
                autoComplete="tel"
                invalid={Boolean(phoneError)}
                describedById={phoneError ? "cl-phoneNo-error" : undefined}
                disabled={saving}
              />
            </Field>
          </div>

          <Field label="Full address" htmlFor="cl-address" required>
            <textarea
              id="cl-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House / street, landmark, area"
              rows={3}
              autoComplete="street-address"
              disabled={saving}
              className={fieldStyles({ className: "resize-none py-3" })}
            />
          </Field>
        </div>

        <div className="mt-5 flex gap-3">
          <Button
            variant="outline"
            size="md"
            className="flex-1"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="gold"
            size="md"
            className="flex-1"
            loading={busy}
            disabled={busy || pendingChange !== null}
            onClick={handleCheck}
          >
            {busy
              ? "Saving…"
              : pendingChange
                ? "Confirm above"
                : "Save Location"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ChangeLocationModal;
