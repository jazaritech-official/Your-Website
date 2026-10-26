"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  DollarSign,
  ShoppingBag,
  Users,
  Package,
} from "lucide-react";
import dynamic from "next/dynamic";
import axios from "axios";
import useFetch, {
  baseUrl,
  invalidateCache,
  cloudinaryUrl,
} from "@/app/utils/commonFunctions";

const ANALYTICS_CACHE_KEY = "admin_analytics";
const ANALYTICS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (matches backend cache)

// recharts is heavy — it only loads (and only gets parsed) when this page is
// actually visited. Until then a pulse placeholder fills the card.
const AnalyticsCharts = dynamic(
  () => import("@/app/Admin/components/AnalyticsCharts"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[280px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
    ),
  },
);

const PERIOD_OPTIONS = [7, 30, 90, 365];

const AnalyticsPage = () => {
  const [analyticsDays, setAnalyticsDays] = useState(90);
  const { data, loading, reFetch } = useFetch<any>(
    `${baseUrl}analytics/summary?days=${analyticsDays}`,
    { cacheKey: ANALYTICS_CACHE_KEY, staleTime: ANALYTICS_CACHE_TTL },
  );
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    if (data?.data) setSummary(data.data);
  }, [data]);

  // Force fresh data: bust the client cache AND the backend's 5-minute
  // in-memory cache (?refresh=true), then re-fetch.
  const refreshAnalytics = async () => {
    invalidateCache(ANALYTICS_CACHE_KEY);
    try {
      await axios.get(
        `${baseUrl}analytics/summary?refresh=true&days=${analyticsDays}`,
        { withCredentials: true },
      );
    } catch {
      /* the reFetch below still shows data */
    }
    reFetch();
  };

  const statCards = [
    {
      label: "Total Revenue",
      value: `Rs ${summary?.totalRevenue?.toLocaleString() || 0}`,
      icon: DollarSign,
      tint: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Total Orders",
      value: summary?.totalOrders?.toLocaleString() || 0,
      icon: ShoppingBag,
      tint: "text-[#0856DF] bg-blue-50",
    },
    {
      label: "Customers",
      value: summary?.totalCustomers?.toLocaleString() || 0,
      icon: Users,
      tint: "text-violet-600 bg-violet-50",
    },
    {
      label: "Products",
      value: summary?.totalProducts?.toLocaleString() || 0,
      icon: Package,
      tint: "text-amber-600 bg-amber-50",
    },
  ];

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="h-3 w-20 rounded bg-gray-200" />
              <div className="mt-3 h-7 w-28 rounded bg-gray-200" />
            </div>
          ))}
        </div>
        <div className="h-[280px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Analytics
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Store performance at a glance
          </p>
        </div>
        {/* Period selector — scopes every aggregation to the last N days */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-500">Period:</span>
          {PERIOD_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setAnalyticsDays(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                analyticsDays === d
                  ? "bg-[#C8A84E] text-white border-[#C8A84E]"
                  : "border-gray-200 text-gray-600 hover:border-[#C8A84E] hover:text-[#C8A84E]"
              }`}
            >
              {d === 365 ? "1 Year" : `${d}d`}
            </button>
          ))}
          <button
            onClick={refreshAnalytics}
            title="Bypass cache and fetch fresh data"
            className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {stat.label}
                </p>
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.tint}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>

      <AnalyticsCharts summary={summary} />

      {/* Top selling products */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-slate-900">
          Top Selling Products
        </h3>
        {summary?.topProducts?.length ? (
          <div className="space-y-3">
            {summary.topProducts.map((p: any, idx: number) => (
              <div
                key={p._id || idx}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"
              >
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cloudinaryUrl(p.image, 80)}
                    alt={p.name}
                    className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-slate-100" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {p.name || "Product"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.unitsSold} units sold
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  Rs {p.revenue?.toLocaleString() || 0}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No sales data yet.</p>
        )}
      </div>
    </div>
  );
};

export default AnalyticsPage;
