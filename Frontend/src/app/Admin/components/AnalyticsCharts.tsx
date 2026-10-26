"use client";
import { formatPKR } from "@/app/utils/format";

/* Charts for the Admin Analytics page. Kept in a separate component so the
 * Analytics page can import it via next/dynamic — the heavy recharts bundle is
 * then only downloaded (and parsed) when the page is actually visited, which
 * keeps the rest of the admin panel snappy. */

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  Pending: "#f59e0b",
  Processing: "#3b82f6",
  Shipped: "#8b5cf6",
  "Out for Delivery": "#06b6d4",
  Delivered: "#10b981",
  Cancelled: "#ef4444",
};

interface AnalyticsChartsProps {
  summary: any;
}

const AnalyticsCharts = ({ summary }: AnalyticsChartsProps) => {
  const revenueData =
    summary?.revenueOverTime?.map((d: any) => ({
      date: d._id?.slice(5) || d._id,
      revenue: d.revenue || 0,
    })) || [];

  const statusData = summary?.byStatus
    ? Object.entries(summary.byStatus).map(([name, value]) => ({
        name,
        value: value as number,
      }))
    : [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Revenue over time */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
        <h3 className="mb-4 text-lg font-bold text-slate-900">
          Revenue (selected period)
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={revenueData} margin={{ left: -20, right: 10, top: 10 }}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0856DF" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#0856DF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
            <Tooltip
              formatter={(v: any) => [`${formatPKR(Number(v))}`, "Revenue"]}
              contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#0856DF"
              strokeWidth={2}
              fill="url(#rev)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Orders by status */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-slate-900">
          Orders by Status
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={statusData} margin={{ left: -20, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "#64748b" }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={60}
            />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "#f1f5f9" }}
              contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {statusData.map((entry: any) => (
                <Cell
                  key={entry.name}
                  fill={STATUS_COLORS[entry.name] || "#0856DF"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AnalyticsCharts;
