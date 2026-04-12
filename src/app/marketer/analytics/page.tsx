"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { ArrowLeft, BarChart3, Users, TrendingUp } from "lucide-react";
import Link from "next/link";
import { MarketerAnalyticsOverview } from "@/components/marketer/MarketerAnalyticsOverview";
import { MarketerDoctorsList } from "@/components/marketer/MarketerDoctorsList";
import { MarketerRequestTimeline } from "@/components/marketer/MarketerRequestTimeline";
import { useDashTheme } from "@/hooks/useDashTheme";

type Tab = "overview" | "doctors" | "requests";

export default function MarketerAnalyticsPage() {
  const { isLight } = useDashTheme();
  const isDark = !isLight;
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/scale/analytics/dashboard");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-slate-950" : "bg-white"}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? "bg-slate-950" : "bg-gray-50"}`}>
      {/* Header */}
      <div className={`sticky top-0 z-40 ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"} border-b`}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/scale/dashboard">
              <button className={`p-2 rounded-lg hover:bg-opacity-50 ${isDark ? "hover:bg-slate-800" : "hover:bg-gray-100"}`}>
                <ArrowLeft className="w-5 h-5" />
              </button>
            </Link>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                Performance Analytics
              </h1>
              <p className={isDark ? "text-slate-400" : "text-gray-500"}>
                Track your doctors and request performance
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className={`${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"} border-b sticky top-16 z-30`}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab("overview")}
              className={`py-4 px-1 border-b-2 font-medium transition-colors flex items-center gap-2 ${
                activeTab === "overview"
                  ? `border-blue-500 ${isDark ? "text-blue-400" : "text-blue-600"}`
                  : `border-transparent ${isDark ? "text-slate-400 hover:text-slate-300" : "text-gray-500 hover:text-gray-700"}`
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab("doctors")}
              className={`py-4 px-1 border-b-2 font-medium transition-colors flex items-center gap-2 ${
                activeTab === "doctors"
                  ? `border-blue-500 ${isDark ? "text-blue-400" : "text-blue-600"}`
                  : `border-transparent ${isDark ? "text-slate-400 hover:text-slate-300" : "text-gray-500 hover:text-gray-700"}`
              }`}
            >
              <Users className="w-4 h-4" />
              Doctors
            </button>
            <button
              onClick={() => setActiveTab("requests")}
              className={`py-4 px-1 border-b-2 font-medium transition-colors flex items-center gap-2 ${
                activeTab === "requests"
                  ? `border-blue-500 ${isDark ? "text-blue-400" : "text-blue-600"}`
                  : `border-transparent ${isDark ? "text-slate-400 hover:text-slate-300" : "text-gray-500 hover:text-gray-700"}`
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Requests
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === "overview" && <MarketerAnalyticsOverview data={data} isDark={isDark} />}
        {activeTab === "doctors" && <MarketerDoctorsList doctors={data?.doctors || []} isDark={isDark} />}
        {activeTab === "requests" && <MarketerRequestTimeline requests={data?.requests || []} isDark={isDark} />}
      </div>
    </div>
  );
}
