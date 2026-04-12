"use client";

import { useState, useEffect } from "react";
import { TrendingUp, Users, CheckCircle, Wallet2 } from "lucide-react";

interface AnalyticsData {
  metrics: {
    total_doctors: number;
    total_requests: number;
    completed_requests: number;
    total_revenue: number;
  };
}

interface MarketerAnalyticsOverviewProps {
  data: AnalyticsData | null;
  isDark: boolean;
}

export function MarketerAnalyticsOverview({ data, isDark }: MarketerAnalyticsOverviewProps) {
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    fetchRevenueChart();
  }, []);

  const fetchRevenueChart = async () => {
    try {
      const res = await fetch("/api/scale/analytics/revenue-chart");
      if (res.ok) {
        const result = await res.json();
        setChartData(result.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch revenue chart:", err);
    }
  };

  if (!data) return null;

  const { metrics } = data;
  const conversionRate = metrics.total_requests > 0
    ? Math.round((metrics.completed_requests / metrics.total_requests) * 100)
    : 0;

  const cards = [
    {
      label: "Doctors Added",
      value: metrics.total_doctors,
      icon: Users,
      color: "from-blue-500 to-blue-600",
    },
    {
      label: "Total Requests",
      value: metrics.total_requests,
      icon: TrendingUp,
      color: "from-purple-500 to-purple-600",
    },
    {
      label: "Conversion Rate",
      value: `${conversionRate}%`,
      icon: CheckCircle,
      color: "from-emerald-500 to-emerald-600",
    },
    {
      label: "Total Revenue",
      value: `₹${metrics.total_revenue.toLocaleString("en-IN")}`,
      icon: Wallet2,
      color: "from-orange-500 to-orange-600",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className={`relative overflow-hidden rounded-lg p-6 ${
                isDark ? "bg-slate-800" : "bg-white"
              } border ${isDark ? "border-slate-700" : "border-gray-200"} shadow-sm`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-10`}></div>
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg bg-gradient-to-br ${card.color}`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div>
                  <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                    {card.label}
                  </p>
                  <p className={`text-2xl font-bold mt-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                    {card.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revenue Chart */}
      {chartData.length > 0 && (
        <div className={`rounded-lg p-6 ${isDark ? "bg-slate-800" : "bg-white"} border ${isDark ? "border-slate-700" : "border-gray-200"} shadow-sm`}>
          <h2 className={`text-lg font-bold mb-6 ${isDark ? "text-white" : "text-gray-900"}`}>
            Revenue Trend (Last 12 Months)
          </h2>
          <div className="space-y-3 overflow-x-auto">
            {chartData.map((item, idx) => {
              const maxRevenue = Math.max(...chartData.map((d) => d.revenue), 1);
              const percentage = (item.revenue / maxRevenue) * 100;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-16 text-right shrink-0">
                    <p className={`text-xs font-medium ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                      {item.label}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`h-8 rounded-lg ${isDark ? "bg-slate-700" : "bg-gray-100"} relative overflow-hidden`}>
                      <div
                        className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                      <span className={`absolute inset-0 flex items-center justify-end pr-2 text-xs font-medium ${percentage > 50 ? "text-white" : isDark ? "text-slate-300" : "text-gray-700"}`}>
                        ₹{(item.revenue / 1000).toFixed(0)}k
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-lg p-6 ${isDark ? "bg-slate-800" : "bg-white"} border ${isDark ? "border-slate-700" : "border-gray-200"}`}>
          <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-gray-600"} mb-2`}>
            Avg Requests per Doctor
          </p>
          <p className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
            {metrics.total_doctors > 0 ? (metrics.total_requests / metrics.total_doctors).toFixed(1) : 0}
          </p>
        </div>
        <div className={`rounded-lg p-6 ${isDark ? "bg-slate-800" : "bg-white"} border ${isDark ? "border-slate-700" : "border-gray-200"}`}>
          <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-gray-600"} mb-2`}>
            Pending Requests
          </p>
          <p className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
            {metrics.total_requests - metrics.completed_requests}
          </p>
        </div>
        <div className={`rounded-lg p-6 ${isDark ? "bg-slate-800" : "bg-white"} border ${isDark ? "border-slate-700" : "border-gray-200"}`}>
          <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-gray-600"} mb-2`}>
            Avg Revenue per Request
          </p>
          <p className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
            ₹{metrics.completed_requests > 0 ? Math.round(metrics.total_revenue / metrics.completed_requests) : 0}
          </p>
        </div>
      </div>
    </div>
  );
}
