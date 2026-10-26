"use client";
import { formatPKR } from "@/app/utils/format";

import { useEffect, useMemo, useState } from "react";
import { ShoppingCart } from "lucide-react";
import useFetch, { baseUrl } from "@/app/utils/commonFunctions";

interface CartProduct {
  _id: string;
  name: string;
  price: number;
  images?: Array<{ url: string }>;
  stock?: number;
}

interface CartItem {
  _id?: string;
  product?: CartProduct | null;
  quantity: number;
}

interface UserCart {
  _id: string;
  username: string;
  email: string;
  phoneNo?: string | null;
  cart: CartItem[];
}

const CartsPage = () => {
  const { data: usersRes, loading } = useFetch<any>(`${baseUrl}auth/getUsers`);
  const [carts, setCarts] = useState<UserCart[]>([]);

  useEffect(() => {
    if (usersRes?.data) {
      const users = Array.isArray(usersRes.data) ? usersRes.data : [];
      const activeCarts = users.filter(
        (user: UserCart) => Array.isArray(user.cart) && user.cart.length > 0,
      );
      setCarts(activeCarts);
    }
  }, [usersRes]);

  const totals = useMemo(() => {
    const totalItems = carts.reduce(
      (sum, user) => sum + user.cart.reduce((itemSum, item) => itemSum + (item.quantity || 1), 0),
      0,
    );
    const totalValue = carts.reduce(
      (sum, user) =>
        sum +
        user.cart.reduce((itemSum, item) => {
          const price = item.product?.price ?? 0;
          return itemSum + price * (item.quantity || 1);
        }, 0),
      0,
    );

    return { totalItems, totalValue };
  }, [carts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Customer Carts
            <span className="rounded-lg bg-[#0856DF] px-2.5 py-1 text-sm font-semibold text-white">
              {carts.length}
            </span>
          </h2>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Live carts from the database
          </p>
        </div>
        <div className="space-y-1 text-sm font-semibold text-slate-700">
          <p>{totals.totalItems} items</p>
          <p>Value: {formatPKR(totals.totalValue)}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-medium text-slate-500">
          Loading carts...
        </div>
      ) : carts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-medium text-slate-500">
          No carts found in the database.
        </div>
      ) : (
        <div className="space-y-4">
          {carts.map((user) => {
            const itemCount = user.cart.reduce(
              (sum, item) => sum + (item.quantity || 1),
              0,
            );
            const cartValue = user.cart.reduce((sum, item) => {
              const price = item.product?.price ?? 0;
              return sum + price * (item.quantity || 1);
            }, 0);

            return (
              <div
                key={user._id}
                className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-3">
                    <h4 className="text-lg font-bold text-slate-900">{user.username}</h4>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {itemCount} items
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-500">{user.email}</p>
                  {user.phoneNo ? (
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      {user.phoneNo}
                    </p>
                  ) : null}
                  <div className="mt-4 space-y-2">
                    {user.cart.map((item, index) => (
                      <div
                        key={`${user._id}-${index}`}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                      >
                        <span>
                          {item.product?.name || "Product unavailable"} × {item.quantity}
                        </span>
                        <span className="font-semibold">
                          {formatPKR((item.product?.price ?? 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex min-w-[180px] flex-col gap-3 lg:items-end lg:text-right">
                  <p className="text-2xl font-bold text-slate-900">
                    {formatPKR(cartValue)}
                  </p>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <ShoppingCart className="h-4 w-4" /> Live from DB
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CartsPage;
