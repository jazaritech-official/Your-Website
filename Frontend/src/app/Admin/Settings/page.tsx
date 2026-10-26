"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import axios from "axios";
import { Loader2, Truck, MapPin, Plus, Trash2, ToggleLeft, ToggleRight, Star, StarOff, RotateCcw, Search, X } from "lucide-react";
import { baseUrl, showToast } from "@/app/utils/commonFunctions";
import { invalidateShippingSettingsCache } from "@/app/utils/shipping";

// ── Pakistan cities dataset with sensible default shipping charges ──
// Used by the "Load Defaults" button. Admin can override any value after loading.
const PAKISTAN_CITY_DEFAULTS: Array<{ city: string; displayName: string; charge: number }> = [
  { city: "karachi", displayName: "Karachi", charge: 250 },
  { city: "lahore", displayName: "Lahore", charge: 300 },
  { city: "islamabad", displayName: "Islamabad", charge: 300 },
  { city: "rawalpindi", displayName: "Rawalpindi", charge: 300 },
  { city: "faisalabad", displayName: "Faisalabad", charge: 300 },
  { city: "multan", displayName: "Multan", charge: 350 },
  { city: "peshawar", displayName: "Peshawar", charge: 350 },
  { city: "quetta", displayName: "Quetta", charge: 450 },
  { city: "hyderabad", displayName: "Hyderabad", charge: 300 },
  { city: "sialkot", displayName: "Sialkot", charge: 300 },
  { city: "gujranwala", displayName: "Gujranwala", charge: 300 },
  { city: "sukkur", displayName: "Sukkur", charge: 400 },
  { city: "default", displayName: "Default/Other (Fallback)", charge: 400 },
];

const SettingsPage = () => {
  // ── Free Shipping Progress Bar settings (functional) ──
  const [freeShippingEnabled, setFreeShippingEnabled] = useState(true);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("2000");
  const [shippingFee, setShippingFee] = useState("0");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // City-wise shipping state
  const [cityShippingEnabled, setCityShippingEnabled] = useState(false);
  const [cityShipping, setCityShipping] = useState<Array<{ city: string; charge: string; enabled: boolean; isDefault: boolean }>>([]);
  const [newCity, setNewCity] = useState("");
  const [newCityCharge, setNewCityCharge] = useState("");
  // City dropdown search state
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [cityDropdownSearch, setCityDropdownSearch] = useState("");
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  // All Pakistan city names for the dropdown (from countries.ts + extras)
  const PAKISTAN_CITIES = useMemo(() => [
    "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad",
    "Multan", "Peshawar", "Quetta", "Hyderabad", "Sialkot",
    "Gujranwala", "Bahawalpur", "Sukkur", "Larkana", "Mardan",
    "Abbottabad", "Dera Ghazi Khan", "Sahiwal", "Wah Cantt",
    "Muzaffarabad", "Gwadar", "Zhob", "Bannu", "Kohat",
    "Dera Ismail Khan", "Gilgit", "Skardu", "Hunza",
    "Nawabshah", "Jacobabad", "Mirpur Khas", "Umerkot",
    "Thatta", "Badin", "Khuzdar", "Turbat", "Panjgur",
    "Chitral", "Dir", "Swat", "Mansehra", "Battagram",
    "Kohistan", "Haripur", "Jhelum", "Gujrat", "Sargodha",
    "Mianwali", "Khushab", "Layyah", "Rahim Yar Khan",
    "Dera Ghazi Khan", "Rajanpur", "Lodhran", "Khanewal",
    "Vehari", "Pakpattan", "Okara", "Nankana Sahib",
    "Kasur", "Sheikhupura", "Hafizabad", "Mandi Bahauddin",
    "Chiniot", "Jhang", "Toba Tek Singh", "Attock",
    "Chakwal", "Talagang", "Murree", "Taxila",
    "Charsadda", "Nowshera", "Swabi", "Lakki Marwat",
    "Karak", "Hangu", "Tank", "South Waziristan",
    "North Waziristan", "Mohmand", "Khyber", "Orakzai",
    "Kurram", "Bajaur", "Malakand",
  ], []);

  // Filtered cities for dropdown
  const filteredCities = useMemo(() => {
    const q = cityDropdownSearch.trim().toLowerCase();
    const existingCities = new Set(cityShipping.map(c => c.city));
    return PAKISTAN_CITIES.filter(c => {
      if (existingCities.has(c.toLowerCase())) return false;
      if (!q) return true;
      return c.toLowerCase().includes(q);
    });
  }, [cityDropdownSearch, cityShipping, PAKISTAN_CITIES]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${baseUrl}settings/admin`, {
          withCredentials: true,
        });
        const data = res.data?.data;
        if (!cancelled && data) {
          setFreeShippingEnabled(
            data.freeShippingProgressBarEnabled !== false,
          );
          setFreeShippingThreshold(
            String(data.freeShippingThreshold ?? 2000),
          );
          setShippingFee(String(data.shippingFee ?? 0));
          setCityShippingEnabled(data.cityShippingEnabled === true);
          if (Array.isArray(data.cityShipping)) {
            setCityShipping(
              data.cityShipping.map((c: any) => ({
                city: c.city || "",
                charge: String(c.charge ?? ""),
                enabled: c.enabled !== false,
                isDefault: c.isDefault === true,
              }))
            );
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          showToast(
            err?.response?.data?.message || "Failed to load store settings",
            "error",
          );
        }
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close city dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target as Node)) {
        setCityDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const saveFreeShippingSettings = async () => {
    const threshold = Number(freeShippingThreshold);
    if (Number.isNaN(threshold) || threshold < 0) {
      showToast("Free shipping threshold must be a non-negative number", "error");
      return;
    }
    const fee = Number(shippingFee);
    if (Number.isNaN(fee) || fee < 0) {
      showToast("Base shipping fee must be a non-negative number", "error");
      return;
    }
    setSaving(true);
    try {
      // Build clean cityShipping array
      const cleanCityShipping = cityShipping.map((c) => ({
        city: c.city.trim().toLowerCase(),
        charge: Number(c.charge) || 0,
        enabled: c.enabled,
        isDefault: c.isDefault,
      }));
      const res = await axios.put(
        `${baseUrl}settings/admin`,
        {
          freeShippingThreshold: Math.round(threshold),
          freeShippingProgressBarEnabled: freeShippingEnabled,
          shippingFee: Math.round(fee),
          cityShippingEnabled,
          cityShipping: cleanCityShipping,
        },
        { withCredentials: true },
      );
      // Drop the storefront's client-side settings cache so the cart/checkout
      // progress bar reflects this change immediately (instead of holding the
      // previous toggle/threshold until the cache TTL expires).
      invalidateShippingSettingsCache();
      showToast(res.data?.message || "Settings saved", "success");
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to save settings",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Load Pakistan City Defaults (idempotent — only adds cities not already configured) ──
  const loadPakistanDefaults = () => {
    const existingCityNames = new Set(cityShipping.map(c => c.city));
    const newEntries: Array<{ city: string; charge: string; enabled: boolean; isDefault: boolean }> = [];

    for (const def of PAKISTAN_CITY_DEFAULTS) {
      if (!existingCityNames.has(def.city)) {
        newEntries.push({
          city: def.city,
          charge: String(def.charge),
          enabled: true,
          isDefault: def.city === "default",
        });
      }
    }

    if (newEntries.length === 0) {
      showToast("All Pakistan city defaults are already loaded", "info");
      return;
    }

    setCityShipping(prev => [...prev, ...newEntries]);
    showToast(`Loaded ${newEntries.length} Pakistan city defaults (existing entries untouched)`, "success");
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* ── Free Shipping Progress Bar (functional) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          <Truck size={22} className="text-[#C8A84E]" />
          Free Shipping Progress Bar
        </h2>
        <p className="mb-6 text-sm text-slate-500">
          Control the storefront free-shipping progress bar shown on the cart
          and checkout pages. Toggle it off to hide it entirely, and set the
          order subtotal that unlocks free shipping.
        </p>

        <div className="space-y-6">
          {/* Enable / disable toggle */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Show free shipping progress bar to customers
              </p>
              <p className="text-xs text-slate-500">
                When off, the bar never renders — on any page, for any cart.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={freeShippingEnabled}
              onClick={() => setFreeShippingEnabled((p) => !p)}
              className={`relative h-7 w-[52px] shrink-0 rounded-full transition-colors ${
                freeShippingEnabled ? "bg-[#C8A84E]" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  freeShippingEnabled ? "left-[26px]" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Threshold input */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Free Shipping Threshold (Rs)
            </label>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700">
                Rs
              </span>
              <input
                type="number"
                min={0}
                step={50}
                value={freeShippingThreshold}
                onChange={(e) => setFreeShippingThreshold(e.target.value)}
                disabled={!freeShippingEnabled}
                className={`w-full max-w-xs rounded-xl border border-slate-300 bg-white p-4 text-sm font-medium text-slate-800 outline-none transition focus:border-[#C8A84E] focus:ring-2 focus:ring-[#C8A84E]/15 disabled:cursor-not-allowed disabled:opacity-50`}
                placeholder="e.g. 2000"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Orders with a subtotal at or above this amount show the
              &ldquo;Free shipping unlocked&rdquo; success state on the cart &amp; checkout.
            </p>
          </div>

          {/* Base shipping fee input */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Base Shipping Fee (Rs)
            </label>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700">
                Rs
              </span>
              <input
                type="number"
                min={0}
                step={50}
                value={shippingFee}
                onChange={(e) => setShippingFee(e.target.value)}
                className="w-full max-w-xs rounded-xl border border-slate-300 bg-white p-4 text-sm font-medium text-slate-800 outline-none transition focus:border-[#C8A84E] focus:ring-2 focus:ring-[#C8A84E]/15"
                placeholder="e.g. 250"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Charged on orders that don&apos;t qualify for free shipping — i.e.
              no per-product free-shipping flag and a subtotal below the
              threshold. Set to 0 to keep every order free.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveFreeShippingSettings}
              disabled={saving || settingsLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-[#C8A84E] px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#B8943F] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {settingsLoading ? "Loading…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* ── City-wise Shipping Charges ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          <MapPin size={22} className="text-[#C8A84E]" />
          City-wise Shipping Charges
        </h2>
        <p className="mb-6 text-sm text-slate-500">
          Configure different shipping charges for different cities in Pakistan. When enabled, the customer&apos;s selected city determines the shipping fee at checkout. Unlisted cities use the &ldquo;Default/Other&rdquo; rate.
        </p>

        <div className="space-y-6">
          {/* Enable / disable toggle */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Enable city-wise shipping charges
              </p>
              <p className="text-xs text-slate-500">
                When off, the base shipping fee is always used.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={cityShippingEnabled}
              onClick={() => setCityShippingEnabled((p) => !p)}
              className={`relative h-7 w-[52px] shrink-0 rounded-full transition-colors ${
                cityShippingEnabled ? "bg-[#C8A84E]" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  cityShippingEnabled ? "left-[26px]" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* City list */}
          {cityShippingEnabled && (
            <>
              {/* Load Pakistan Defaults button */}
              <div className="rounded-xl border border-dashed border-[#C8A84E]/40 bg-[#C8A84E]/[0.03] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Load Pakistan City Defaults
                    </p>
                    <p className="text-xs text-slate-500">
                      Pre-populates major Pakistani cities with sensible shipping charges. Only adds cities not already configured — never overwrites your custom values.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadPakistanDefaults}
                    className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-[#C8A84E]/30 bg-white px-4 py-2 text-xs font-semibold text-[#C8A84E] transition hover:bg-[#C8A84E]/10"
                  >
                    <RotateCcw size={13} /> Load Defaults
                  </button>
                </div>
              </div>

              {/* Add City form */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Add City
                </p>
                <div className="flex gap-2">
                  {/* Searchable city dropdown */}
                  <div className="relative flex-1" ref={cityDropdownRef}>
                    <div
                      className="flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm cursor-pointer transition focus-within:border-[#C8A84E] focus-within:ring-1 focus-within:ring-[#C8A84E]/15"
                      onClick={() => setCityDropdownOpen((p) => !p)}
                    >
                      <Search size={14} className="shrink-0 text-slate-400" />
                      <input
                        type="text"
                        value={cityDropdownSearch}
                        onChange={(e) => {
                          setCityDropdownSearch(e.target.value);
                          setCityDropdownOpen(true);
                          setNewCity("");
                        }}
                        onFocus={() => setCityDropdownOpen(true)}
                        placeholder="Search Pakistani cities…"
                        className="flex-1 bg-transparent outline-none text-sm"
                      />
                      {cityDropdownSearch && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCityDropdownSearch("");
                            setNewCity("");
                          }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    {newCity && (
                      <div className="mt-1 rounded-lg border border-[#C8A84E]/30 bg-[#C8A84E]/5 px-3 py-1.5 text-xs font-medium text-[#C8A84E]">
                        Selected: {newCity}
                      </div>
                    )}
                    {cityDropdownOpen && (
                      <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {filteredCities.length === 0 ? (
                          <div className="px-3 py-2.5 text-xs text-slate-400">
                            {cityDropdownSearch ? "No matching cities" : "All cities already added"}
                          </div>
                        ) : (
                          filteredCities.map((city) => (
                            <button
                              key={city}
                              type="button"
                              onClick={() => {
                                setNewCity(city);
                                setCityDropdownSearch("");
                                setCityDropdownOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
                            >
                              {city}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={newCityCharge}
                    onChange={(e) => setNewCityCharge(e.target.value)}
                    placeholder="Charge (Rs)"
                    className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#C8A84E] focus:ring-1 focus:ring-[#C8A84E]/15"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newCity.trim() || !newCityCharge.trim()) return;
                      const charge = Number(newCityCharge);
                      if (isNaN(charge) || charge < 0) {
                        showToast("Charge must be a non-negative number", "error");
                        return;
                      }
                      const cityLower = newCity.trim().toLowerCase();
                      if (cityShipping.some((c) => c.city === cityLower)) {
                        showToast("City already exists", "warn");
                        return;
                      }
                      setCityShipping((prev) => [
                        ...prev,
                        { city: cityLower, charge: String(Math.round(charge)), enabled: true, isDefault: false },
                      ]);
                      setNewCity("");
                      setNewCityCharge("");
                      setCityDropdownSearch("");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#C8A84E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#B8943F]"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>

              {cityShipping.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600">
                        <th className="px-4 py-2.5">City</th>
                        <th className="px-4 py-2.5">Charge (Rs)</th>
                        <th className="px-4 py-2.5">Default?</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cityShipping.map((entry, idx) => (
                        <tr key={entry.city} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2.5 font-medium capitalize text-slate-800">
                            {entry.city === "default" ? (
                              <span className="inline-flex items-center gap-1.5 text-[#C8A84E] font-bold">
                                <Star size={14} className="fill-[#C8A84E]" /> Default/Other
                              </span>
                            ) : (
                              entry.city
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              min={0}
                              step={10}
                              value={entry.charge}
                              onChange={(e) => {
                                setCityShipping((prev) =>
                                  prev.map((c, i) => (i === idx ? { ...c, charge: e.target.value } : c))
                                );
                              }}
                              className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none transition focus:border-[#C8A84E] focus:ring-1 focus:ring-[#C8A84E]/15"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                setCityShipping((prev) =>
                                  prev.map((c, i) => ({
                                    ...c,
                                    isDefault: i === idx ? !c.isDefault : false,
                                  }))
                                );
                              }}
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md transition ${
                                entry.isDefault
                                  ? "bg-[#C8A84E]/15 text-[#C8A84E]"
                                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              }`}
                              title={entry.isDefault ? "This is the default fallback rate" : "Set as default fallback"}
                            >
                              {entry.isDefault ? (
                                <><Star size={13} className="fill-[#C8A84E]" /> Default</>
                              ) : (
                                <><StarOff size={13} /> Set Default</>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                setCityShipping((prev) =>
                                  prev.map((c, i) => (i === idx ? { ...c, enabled: !c.enabled } : c))
                                );
                              }}
                              className="inline-flex items-center gap-1 text-xs font-semibold"
                            >
                              {entry.enabled ? (
                                <><ToggleRight size={18} className="text-[#C8A84E]" /> Active</>
                              ) : (
                                <><ToggleLeft size={18} className="text-slate-400" /> Disabled</>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setCityShipping((prev) => prev.filter((_, i) => i !== idx));
                              }}
                              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Save button at bottom of city-wise section */}
          <div className="flex justify-end">
            <button
              onClick={saveFreeShippingSettings}
              disabled={saving || settingsLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-[#C8A84E] px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#B8943F] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {settingsLoading ? "Loading…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Store Configuration (legacy static form — untouched) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="mb-8 border-b border-slate-200 pb-6 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Store Configuration
        </h2>

        <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-6">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Store Name
              </label>
              <input
                type="text"
                defaultValue="Irhas'Inn"
                className="w-full rounded-xl border border-slate-300 bg-white p-4 text-sm font-medium text-slate-800 outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
              />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Currency
                </label>
                <select className="w-full appearance-none rounded-xl border border-slate-300 bg-white p-4 text-sm font-medium text-slate-800 outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15">
                  <option>PKR (Rs)</option>
                  <option>USD ($)</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Contact Email
                </label>
                <input
                  type="email"
                  defaultValue="admin@irhasinn.com"
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-sm font-medium text-slate-800 outline-none transition focus:border-[#0856DF] focus:ring-2 focus:ring-[#0856DF]/15"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-200 pt-6">
            <button className="rounded-xl bg-[#0856DF] px-10 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0645c8]">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsPage;
