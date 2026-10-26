"use client";

import React, { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Package, ArrowRight, MapPin, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import { Button, Field, SectionLabel, TextInput } from "../Components/ui";
import { motion } from "framer-motion";
import { fadeUp } from "../utils/motion";
import { useBranding } from "../Components/ThemeProvider";

const TRUST_POINTS = [
  { icon: Truck, label: "Real-time updates" },
  { icon: Package, label: "Order details" },
  { icon: MapPin, label: "Live delivery location" },
] as const;

export default function TrackOrderLandingPage() {
  // Admin-configured logo / site name (server-provided).
  const { logoUrl, siteName } = useBranding();
  const router = useRouter();
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = orderId.trim();

    if (!trimmed) {
      setError("Please enter an Order ID to track.");
      return;
    }

    setError("");
    router.push(`/track-order/${encodeURIComponent(trimmed)}`);
  };

  return (
    <main className="min-h-[calc(100vh-200px)] bg-surface-page px-4 pb-20 pt-14">
      <div className="mx-auto w-full max-w-lg">
        {/* ── Branded header ── */}
        <motion.header
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mb-8 text-center"
        >
          <div className="mb-5 inline-flex flex-col items-center">
            <img
              src={logoUrl}
              alt={siteName}
              className="h-16 w-auto rounded-card border border-brand-gold/25 object-contain shadow-card"
            />
          </div>
          <SectionLabel>Order tracking</SectionLabel>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-brand-navy sm:text-4xl">
            Track Your Order
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">
            Enter your Order ID to see the current status, shipping details and
            delivery progress of your purchase.
          </p>
        </motion.header>

        {/* ── Lookup card ── */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.06 }}
          className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-7"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <Field
              label="Order ID"
              htmlFor="order-id-input"
              required
              error={error || undefined}
              hint="Find it in your order confirmation or under My Orders."
            >
              <TextInput
                id="order-id-input"
                type="text"
                value={orderId}
                invalid={Boolean(error)}
                describedById={error ? "order-id-input-error" : "order-id-input-hint"}
                onChange={(e) => {
                  setOrderId(e.target.value);
                  if (error) setError("");
                }}
                placeholder="e.g. 67f2a1b4c8d9e0f123456789"
                autoComplete="off"
                autoFocus
              />
            </Field>

            <Button
              type="submit"
              variant="gold"
              size="lg"
              fullWidth
              className="group"
            >
              Track Order
              <ArrowRight
                size={18}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </Button>
          </form>

          <p className="mt-4 text-center text-xs leading-relaxed text-ink-subtle">
            You can also find every order under{" "}
            <Link
              href="/profile/orders"
              className="font-semibold text-brand-gold-hover underline-offset-2 hover:underline"
            >
              My Orders
            </Link>
            .
          </p>
        </motion.section>

        {/* ── Trust strip ── */}
        <motion.ul
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.12 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
        >
          {TRUST_POINTS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 text-xs font-medium text-ink-subtle">
              <Icon size={15} className="text-brand-gold" aria-hidden />
              <span>{label}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 text-xs font-medium text-ink-subtle">
            <ShieldCheck size={15} className="text-brand-gold" aria-hidden />
            <span>Secure lookup</span>
          </li>
        </motion.ul>
      </div>
    </main>
  );
}
