"use client";

import { useState } from "react";
import { Search, TrendingUp, Calendar, MapPin } from "lucide-react";

interface Doctor {
  doctor_email: string;
  doctor_name: string;
  doctor_phone: string | null;
  hospitals: string[];
  total_requests: number;
  completed_requests: number;
  total_revenue: number;
  last_request_date: string | null;
  linked_since: string;
}

interface MarketerDoctorsListProps {
  doctors: Doctor[];
  isDark: boolean;
}

export function MarketerDoctorsList({ doctors, isDark }: MarketerDoctorsListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"requests" | "revenue" | "name">("requests");

  const filtered = doctors
    .filter(
      (d) =>
        d.doctor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.doctor_email.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "requests") return b.total_requests - a.total_requests;
      if (sortBy === "revenue") return b.total_revenue - a.total_revenue;
      return a.doctor_name.localeCompare(b.doctor_name);
    });

  return (
    <div className="space-y-4">
      {/* Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className={`flex-1 flex items-center gap-2 px-4 py-2 rounded-lg border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-300"}`}>
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search doctors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`flex-1 bg-transparent outline-none ${isDark ? "text-white placeholder-slate-500" : "text-gray-900 placeholder-gray-400"}`}
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className={`px-4 py-2 rounded-lg border ${isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-gray-300 text-gray-900"}`}
        >
          <option value="requests">Sort by Requests</option>
          <option value="revenue">Sort by Revenue</option>
          <option value="name">Sort by Name</option>
        </select>
      </div>

      {/* Doctors List */}
      {filtered.length === 0 ? (
        <div className={`text-center py-12 rounded-lg border-2 border-dashed ${isDark ? "border-slate-700" : "border-gray-300"}`}>
          <p className={isDark ? "text-slate-400" : "text-gray-500"}>No doctors found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((doctor) => {
            const conversionRate = doctor.total_requests > 0
              ? Math.round((doctor.completed_requests / doctor.total_requests) * 100)
              : 0;

            return (
              <div
                key={doctor.doctor_email}
                className={`rounded-lg p-4 border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"} hover:shadow-md transition-shadow`}
              >
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                        {doctor.doctor_name}
                      </h3>
                      <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                        {doctor.doctor_email}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-500">
                        ₹{doctor.total_revenue.toLocaleString("en-IN")}
                      </p>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                        Total Revenue
                      </p>
                    </div>
                  </div>

                  {/* Contact Details */}
                  {(doctor.doctor_phone || doctor.hospitals.length > 0) && (
                    <div className="flex flex-wrap gap-3 pt-2 border-t border-opacity-20 border-gray-400">
                      {doctor.doctor_phone && (
                        <span className={`text-xs ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                          📱 {doctor.doctor_phone}
                        </span>
                      )}
                      {doctor.hospitals.length > 0 && (
                        <span className={`text-xs ${isDark ? "text-slate-400" : "text-gray-600"} flex items-center gap-1`}>
                          <MapPin className="w-3 h-3" />
                          {doctor.hospitals[0]}
                          {doctor.hospitals.length > 1 && ` +${doctor.hospitals.length - 1}`}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    <div className={`p-2 rounded ${isDark ? "bg-slate-700" : "bg-gray-100"} text-center`}>
                      <p className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                        {doctor.total_requests}
                      </p>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                        Requests
                      </p>
                    </div>
                    <div className={`p-2 rounded ${isDark ? "bg-slate-700" : "bg-gray-100"} text-center`}>
                      <p className={`text-lg font-bold text-emerald-500`}>
                        {doctor.completed_requests}
                      </p>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                        Completed
                      </p>
                    </div>
                    <div className={`p-2 rounded ${isDark ? "bg-slate-700" : "bg-gray-100"} text-center`}>
                      <p className={`text-lg font-bold text-blue-500`}>
                        {conversionRate}%
                      </p>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                        Conversion
                      </p>
                    </div>
                    <div className={`p-2 rounded ${isDark ? "bg-slate-700" : "bg-gray-100"} text-center`}>
                      <p className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                        {doctor.last_request_date ? new Date(doctor.last_request_date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "-"}
                      </p>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                        Last Request
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
