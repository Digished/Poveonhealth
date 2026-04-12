"use client";

import { useState } from "react";
import { Search, Filter, CheckCircle, Clock, AlertCircle } from "lucide-react";

interface Request {
  id: string;
  code: string;
  doctor_email: string;
  status: string;
  lab_name: string | null;
  created_at: string;
  completed_at: string | null;
  lab_revenue_amount: number;
}

interface MarketerRequestTimelineProps {
  requests: Request[];
  isDark: boolean;
}

export function MarketerRequestTimeline({ requests, isDark }: MarketerRequestTimelineProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "incoming" | "seen" | "done">("all");

  const filtered = requests
    .filter((r) => {
      const matchesSearch =
        r.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.doctor_email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "all" || r.status === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const getStatusIcon = (status: string) => {
    if (status === "done") return <CheckCircle className="w-5 h-5 text-emerald-500" />;
    if (status === "seen") return <CheckCircle className="w-5 h-5 text-blue-500" />;
    return <Clock className="w-5 h-5 text-amber-500" />;
  };

  const getStatusColor = (status: string) => {
    if (status === "done") return isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-50 text-emerald-700";
    if (status === "seen") return isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-50 text-blue-700";
    return isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-50 text-amber-700";
  };

  return (
    <div className="space-y-4">
      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className={`flex-1 flex items-center gap-2 px-4 py-2 rounded-lg border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-300"}`}>
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by request code or doctor email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`flex-1 bg-transparent outline-none ${isDark ? "text-white placeholder-slate-500" : "text-gray-900 placeholder-gray-400"}`}
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className={`px-4 py-2 rounded-lg border ${isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-gray-300 text-gray-900"}`}
        >
          <option value="all">All Statuses</option>
          <option value="incoming">Incoming</option>
          <option value="seen">Seen</option>
          <option value="done">Completed</option>
        </select>
      </div>

      {/* Requests List */}
      {filtered.length === 0 ? (
        <div className={`text-center py-12 rounded-lg border-2 border-dashed ${isDark ? "border-slate-700" : "border-gray-300"}`}>
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className={isDark ? "text-slate-400" : "text-gray-500"}>No requests found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((request, idx) => (
            <div
              key={request.id}
              className={`flex items-center gap-4 p-4 rounded-lg border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"} hover:shadow-md transition-shadow`}
            >
              {/* Timeline indicator (only show for mobile/compact view) */}
              <div className="flex-shrink-0">
                {getStatusIcon(request.status)}
              </div>

              {/* Request details */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                      {request.code}
                    </p>
                    <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                      {request.doctor_email}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    {request.lab_name && (
                      <span className={`text-xs px-2 py-1 rounded ${isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-700"}`}>
                        {request.lab_name}
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-1 rounded font-medium ${getStatusColor(request.status)}`}
                    >
                      {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    </span>
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  <span className={isDark ? "text-slate-500" : "text-gray-500"}>
                    Created {new Date(request.created_at).toLocaleDateString("en-IN")}
                  </span>
                  {request.completed_at && (
                    <span className={isDark ? "text-slate-500" : "text-gray-500"}>
                      • Completed {new Date(request.completed_at).toLocaleDateString("en-IN")}
                    </span>
                  )}
                </div>
              </div>

              {/* Revenue */}
              <div className="flex-shrink-0 text-right">
                <p className="font-semibold text-blue-500">
                  ₹{request.lab_revenue_amount.toLocaleString("en-IN")}
                </p>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  Revenue
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
