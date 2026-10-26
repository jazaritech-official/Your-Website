"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { RootState } from "../Redux/store";
import { baseUrl, showToast } from "../utils/commonFunctions";
import ProductCard from "../Components/ProductCard";
import { Heart, ArrowLeft, ShoppingBag, Lock } from "lucide-react";
import Link from "next/link";
import {
  Badge,
  buttonStyles,
  EmptyState,
  SectionLabel,
} from "../Components/ui";
import { ProductCardSkeleton } from "../Components/PremiumSkeleton";

export default function WishlistPage() {
  const auth = useSelector((state: RootState) => state.auth);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.username) return;
    const fetchWishlist = async () => {
      try {
        const res = await axios.get(`${baseUrl}auth/wishlist`, {
          withCredentials: true,
        });
        const products = res.data?.data || [];
        setWishlist(Array.isArray(products) ? products : []);
      } catch (err: any) {
        showToast(err?.response?.data?.message || "Failed to load wishlist", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchWishlist();
  }, [auth.username]);

  if (!auth.username) {
    return (
      <main className="min-h-screen bg-surface-page px-4 pb-16 pt-10">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={<Lock size={26} />}
            title="Sign in to view your wishlist"
            description="Your saved pieces live with your account. Sign in and they will be right here waiting."
            action={
              <Link href="/" className={buttonStyles({ variant: "gold", size: "md" })}>
                <ArrowLeft size={16} /> Back to Home
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  const itemCount = wishlist.length;

  return (
    <main className="min-h-screen bg-surface-page px-4 pb-16 pt-8">
      <div className="mx-auto max-w-7xl">
        {/* ── Page header ── */}
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-brand-gold/12 text-brand-gold"
            >
              <Heart size={22} strokeWidth={2.2} />
            </span>
            <div>
              <SectionLabel>Saved pieces</SectionLabel>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-brand-navy sm:text-[1.75rem]">
                My Wishlist
              </h1>
            </div>
          </div>

          {!loading && itemCount > 0 && (
            <Badge tone="gold" size="md" dot>
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </Badge>
          )}
        </header>

        {loading ? (
          /* Skeleton mirrors the real grid exactly, so nothing shifts. */
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : itemCount === 0 ? (
          <EmptyState
            icon={<Heart size={26} />}
            title="Your wishlist is empty"
            description="Tap the heart on any product to keep it here while you decide."
            action={
              <Link
                href="/productsPage"
                className={buttonStyles({ variant: "gold", size: "md" })}
              >
                <ShoppingBag size={16} /> Browse Products
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {wishlist.map((product: any) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
