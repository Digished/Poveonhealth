"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { TrendingUp, Users, BarChart3, DollarSign, Filter, ChevronDown } from "lucide-react";
import { RefreshCw } from "lucide-react";

interface MarketerMetrics {
  marketer_id: string;
  marketer_name: string;
  marketer_email: string;
  doctors_count: number;
  total_requests: number;
  incoming_requests: number;
  seen_requests: number;
  completed_requests: number;
  conversion_rate: number;
  completion_rate: number;
  total_revenue: number;
  tests: Record<string, number>;
  average_revenue_per_request: number;
  average_revenue_per_doctor: number;
  linked_since: string;
}

interface AnalyticsData {
  analytics: MarketerMetrics[];
  summary: {
    total_marketers: number;
    total_doctors: number;
    total_requests: number;
    total_revenue: number;
  };
}

type SortBy = "revenue" | "requests" | "doctors" | "conversion" | "name";
type SortOrder = "asc" | "desc";

export function LabMarketerAnalytics({ labId }: { labId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("revenue");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [expandedMarketer, setExpandedMarketer] = useState<string | null>(null);
  const [minRevenue, setMinRevenue] = useState(0);

  useEffect(() => {
    fetchAnalytics();
  }, [labId]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/lab/${labId}/marketers/analytics`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load marketer analytics");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!data || data.analytics.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
        <Users className="w-12 h-12 mx-auto mb-3 text-slate-500" />
        <p className="text-slate-400">No marketers assigned yet. Add marketers to track their performance.</p>
      </div>
    );
  }

  // Sort data
  const sortedData = [...data.analytics].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortBy) {
      case "revenue":
        aVal = a.total_revenue;
        bVal = b.total_revenue;
        break;
      case "requests":
        aVal = a.total_requests;
        bVal = b.total_requests;
        break;
      case "doctors":
        aVal = a.doctors_count;
        bVal = b.doctors_count;
        break;
      case "conversion":
        aVal = a.conversion_rate;
        bVal = b.conversion_rate;
        break;
      case "name":
        aVal = a.marketer_name.toLowerCase();
        bVal = b.marketer_name.toLowerCase();
        break;
    }

    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  }).filter((m) => m.total_revenue >= minRevenue);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Total Marketers</p>
              <p className="text-2xl font-bold text-white mt-1">{data.summary.total_marketers}</p>
            </div>
            <Users className="w-8 h-8 text-blue-400 opacity-50" />
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Total Doctors</p>
              <p className="text-2xl font-bold text-white mt-1">{data.summary.total_doctors}</p>
            </div>
            <Users className="w-8 h-8 text-emerald-400 opacity-50" />
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Total Requests</p>
              <p className="text-2xl font-bold text-white mt-1">{data.summary.total_requests}</p>
            </div>
            <BarChart3 className="w-8 h-8 text-orange-400 opacity-50" />
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Total Revenue</p>
              <p className="text-2xl font-bold text-white mt-1">₹{(data.summary.total_revenue / 1000).toFixed(0)}k</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-400 opacity-50" />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-slate-400" />
          <p className="text-sm font-semibold text-slate-300">Filters & Sorting</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="revenue">Revenue</option>
              <option value="requests">Requests</option>
              <option value="doctors">Doctors</option>
              <option value="conversion">Conversion Rate</option>
              <option value="name">Name</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">Order</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="desc">Highest First</option>
              <option value="asc">Lowest First</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">Min Revenue (₹)</label>
            <input
              type="number"
              value={minRevenue}
              onChange={(e) => setMinRevenue(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="0"
            />
          </div>
        </div>

        <button
          onClick={fetchAnalytics}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 text-sm font-semibold hover:bg-blue-600/30 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Marketers Table */}
      <div className="space-y-3">
        {sortedData.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            No marketers match the current filters.
          </div>
        ) : (
          sortedData.map((m) => (
            <div
              key={m.marketer_id}
              className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/8 transition-colors"
            >
              <button
                onClick={() =>
                  setExpandedMarketer(expandedMarketer === m.marketer_id ? null : m.marketer_id)
                }
                className="w-full px-5 py-4 text-left flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white">{m.marketer_name}</h3>
                  <p className="text-xs text-slate-500">{m.marketer_email}</p>
                </div>

                <div className="grid grid-cols-5 gap-4 shrink-0 text-right text-xs">
                  <div>
                    <p className="text-slate-400">Revenue</p>
                    <p className="text-lg font-bold text-green-400 mt-1">₹{(m.total_revenue / 1000).toFixed(1)}k</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Requests</p>
                    <p className="text-lg font-bold text-blue-400 mt-1">{m.total_requests}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Doctors</p>
                    <p className="text-lg font-bold text-emerald-400 mt-1">{m.doctors_count}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Conversion</p>
                    <p className="text-lg font-bold text-orange-400 mt-1">{m.conversion_rate}%</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Completion</p>
                    <p className="text-lg font-bold text-purple-400 mt-1">{m.completion_rate}%</p>
                  </div>
                </div>

                <ChevronDown
                  className={`w-5 h-5 text-slate-500 transition-transform ${
                    expandedMarketer === m.marketer_id ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Expanded Details */}
              {expandedMarketer === m.marketer_id && (
                <div className="border-t border-white/5 px-5 py-4 bg-slate-950/40 space-y-4">
                  {/* Request Breakdown */}
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Request Breakdown
                    </p>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-400">Incoming</p>
                        <p className="text-lg font-bold text-amber-400 mt-1">{m.incoming_requests}</p>
                        <p className="text-xs text-slate-600 mt-1">
                          {m.total_requests > 0
                            ? `${Math.round((m.incoming_requests / m.total_requests) * 100)}%`
                            : "0%"}
                        </p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-400">Seen</p>
                        <p className="text-lg font-bold text-blue-400 mt-1">{m.seen_requests}</p>
                        <p className="text-xs text-slate-600 mt-1">
                          {m.total_requests > 0
                            ? `${Math.round((m.seen_requests / m.total_requests) * 100)}%`
                            : "0%"}
                        </p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-400">Completed</p>
                        <p className="text-lg font-bold text-emerald-400 mt-1">{m.completed_requests}</p>
                        <p className="text-xs text-slate-600 mt-1">
                          {m.total_requests > 0
                            ? `${Math.round((m.completed_requests / m.total_requests) * 100)}%`
                            : "0%"}
                        </p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-400">Avg/Request</p>
                        <p className="text-lg font-bold text-orange-400 mt-1">
                          ₹{m.average_revenue_per_request.toFixed(0)}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">revenue</p>
                      </div>
                    </div>
                  </div>

                  {/* Top Tests */}
                  {Object.keys(m.tests).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Top Tests Ordered
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(m.tests)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 10)
                          .map(([test, count]) => (
                            <span
                              key={test}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-white/5 rounded-lg text-xs text-slate-300"
                            >
                              {test}
                              <span className="font-semibold text-blue-400">×{count}</span>
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Additional Metrics */}
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Performance Metrics
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Avg/Doctor</p>
                        <p className="text-lg font-bold text-blue-400 mt-1">
                          ₹{m.average_revenue_per_doctor.toFixed(0)}
                        </p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Linked Since</p>
                        <p className="text-sm text-slate-300 mt-1 font-mono">
                          {new Date(m.linked_since).toLocaleDateString("en-GB")}
                        </p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <p className="text-xs text-slate-400">Tests Ordered</p>
                        <p className="text-lg font-bold text-purple-400 mt-1">
                          {Object.keys(m.tests).length}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
