"use client";

import { ChevronRight, PackageSearch, ShoppingBag, TrendingUp, Users, BarChart3 } from "lucide-react";
import { useRouter } from "next/navigation";
import useFetch, { baseUrl } from "@/app/utils/commonFunctions";
import { StatCard } from "../../Components/ui";

const CACHE_TTL = 30_000; // 30 seconds

// Stat-card skeleton so the overview feels instant on back-navigation.
const StatSkeleton = () => (
  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="animate-pulse">
      <div className="flex items-start justify-between">
        <div className="h-3 w-24 rounded bg-gray-200" />
        <div className="h-11 w-11 rounded-lg bg-gray-100" />
      </div>
      <div className="mt-3 h-7 w-28 rounded bg-gray-200" />
      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="h-3 w-20 rounded bg-gray-200" />
      </div>
    </div>
  </div>
);

const OverviewPage = () => {
  const router = useRouter();
  const { data: productsRes, loading: productsLoading } = useFetch<any>(
    `${baseUrl}product/getAllProducts`,
    { cacheKey: "admin_products", staleTime: CACHE_TTL },
  );
  const { data: ordersRes, loading: ordersLoading } = useFetch<any>(
    `${baseUrl}order/getAllOrders`,
    { cacheKey: "admin_orders", staleTime: CACHE_TTL },
  );
  const { data: usersRes, loading: usersLoading } = useFetch<any>(
    `${baseUrl}auth/getUsers`,
    { cacheKey: "admin_users", staleTime: CACHE_TTL },
  );

  // The admin endpoints return `{ products/orders/users, pagination }` payloads
  // — normalize both that shape and a plain-array response.
  const products = Array.isArray(productsRes?.data)
    ? productsRes.data
    : productsRes?.data?.products || [];
  const orders = Array.isArray(ordersRes?.data)
    ? ordersRes.data
    : ordersRes?.data?.orders || [];
  const users = Array.isArray(usersRes?.data)
    ? usersRes.data
    : usersRes?.data?.users || [];

  const isLoadingOverview = productsLoading || ordersLoading || usersLoading;

  const lowStockCount = Array.isArray(products)
    ? products.filter((product: any) => product.stock <= 10).length
    : 0;

  const stats = [
    {
      label: "Total Revenue",
      value: `PKR ${orders
        .reduce((total: number, order: any) => total + (order.totalPrice || 0), 0)
        .toLocaleString()}`,
      // TODO: API does not return % change — using placeholder
      changePercent: "+12.5%",
      icon: TrendingUp,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-500",
    },
    {
      label: "Active Orders",
      value: `${orders.length}`,
      changePercent: "+5.2%",
      icon: ShoppingBag,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
    },
    {
      label: "Total Customers",
      value: `${users.length}`,
      changePercent: "+18.1%",
      icon: Users,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
    },
    {
      label: "Low Stock Items",
      value: `${lowStockCount}`,
      changePercent: lowStockCount > 0 ? "-2.4%" : "+0.0%",
      icon: PackageSearch,
      iconBg: "bg-red-50",
      iconColor: "text-[#DC2626]",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoadingOverview ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : stats.map((stat, idx) => (
          <StatCard key={idx} {...stat} />
        ))}
      </div>

      {/* Two-column: Sales Overview + Recent Orders */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Orders */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C9A227]">
                Orders
              </span>
              <h3 className="mt-1 text-lg font-bold text-[#111827]">Recent Orders</h3>
            </div>
            <button
              onClick={() => router.push("/Admin/Orders")}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-[#6B7280] transition hover:bg-gray-50 hover:text-[#111827]"
            >
              View All
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {(ordersLoading ? Array.from({ length: 3 }) : orders.slice(0, 5)).map((order: any, idx: number) => (
                  <tr key={order?._id ?? idx} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-mono text-xs text-[#111827]">
                      {order?._id ? order._id.slice(-8) : "Loading..."}
                    </td>
                    <td className="px-6 py-4 font-medium text-[#6B7280]">
                      {order?.user?.username || order?.user?.email || "—"}
                    </td>
                    <td className="px-6 py-4 font-bold text-[#111827]">
                      Rs {order?.totalPrice?.toLocaleString() || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          order?.paymentStatus === "paid"
                            ? "bg-emerald-100 text-emerald-700"
                            : order?.paymentStatus === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {order?.paymentStatus || "pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C9A227]">
              Actions
            </span>
            <h3 className="mt-1 mb-4 text-lg font-bold text-[#111827]">Quick Actions</h3>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => router.push("/Admin/Products")}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-4 text-left transition hover:border-[#C9A227]/40 hover:bg-[#C9A227]/[0.03]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1B2027]">
                  <PackageSearch className="h-4 w-4 text-[#C9A227]" />
                </div>
                <span className="text-sm font-semibold text-[#111827]">Add Product</span>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>
            <button
              onClick={() => router.push("/Admin/Categories")}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-4 text-left transition hover:border-[#C9A227]/40 hover:bg-[#C9A227]/[0.03]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#C9A227]">
                  <BarChart3 className="h-4 w-4 text-[#1B2027]" />
                </div>
                <span className="text-sm font-semibold text-[#111827]">Update Categories</span>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewPage;
