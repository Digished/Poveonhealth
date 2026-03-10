"use client";

import { useState } from "react";
import { PoveonLogo } from "@/components/PoveonLogo";

/* ─── Types ─────────────────────────────────────────────────────────── */
type Method = "GET" | "POST" | "PATCH" | "DELETE";
type AuthLevel = "public" | "lab" | "admin";

interface Param {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface Endpoint {
  id: string;
  method: Method;
  path: string;
  summary: string;
  description: string;
  auth: AuthLevel;
  params?: Param[];
  body?: Param[];
  responseExample: string;
  notes?: string[];
}

interface Section {
  id: string;
  label: string;
  icon: string;
  color: string;
  endpoints: Endpoint[];
}

/* ─── Data ───────────────────────────────────────────────────────────── */
const sections: Section[] = [
  {
    id: "public",
    label: "Public Endpoints",
    icon: "🌐",
    color: "emerald",
    endpoints: [
      {
        id: "get-labs",
        method: "GET",
        path: "/api/labs",
        summary: "List Laboratories",
        description:
          "Returns all visible (non-hidden) laboratories. Used to populate the lab selector in the request form. Response is never cached — always returns fresh data.",
        auth: "public",
        responseExample: JSON.stringify(
          {
            success: true,
            labs: [
              {
                id: "uuid",
                name: "Central Diagnostics Lab",
                prefix: "CDL",
                address: "12 Hospital Rd, Lagos",
                description: "...",
                phones: ["+2348012345678"],
                email: "lab@example.com",
                logo_url: "https://...",
                hidden: false,
                created_at: "2025-01-01T00:00:00Z",
                service_categories: ["Hematology", "Clinical Chemistry"],
                certifications: ["MLSCN Registered", "ISO 15189"],
              },
            ],
          },
          null,
          2
        ),
      },
      {
        id: "create-request",
        method: "POST",
        path: "/api/requests/create",
        summary: "Create Lab Request",
        description:
          "Creates a new lab test request on behalf of a doctor. Generates a unique request code tied to the selected lab. Sends confirmation emails to the doctor and (optionally) the patient.",
        auth: "public",
        body: [
          { name: "patient_name", type: "string", required: true, description: "Full name of the patient (2–200 chars)" },
          { name: "dob", type: "string", required: true, description: "Date of birth in YYYY-MM-DD format" },
          { name: "sex", type: '"male" | "female"', required: true, description: "Patient biological sex" },
          { name: "tests", type: "string", required: true, description: "Tests requested (2–2000 chars)" },
          { name: "lab_id", type: "UUID", required: true, description: "ID of the target laboratory" },
          { name: "doctor_name", type: "string", required: true, description: "Full name of the referring doctor" },
          { name: "doctor_email", type: "string (email)", required: true, description: "Doctor's email for confirmation" },
          { name: "address", type: "string", required: false, description: "Patient's home address" },
          { name: "patient_email", type: "string (email)", required: false, description: "Patient email for code notification" },
          { name: "patient_phone", type: "string", required: false, description: "Patient phone number" },
          { name: "doctor_prefix", type: "string", required: false, description: "Title prefix (Dr., Prof., etc.)" },
          { name: "doctor_phone", type: "string", required: false, description: "Doctor's phone number" },
          { name: "doctor_bank_name", type: "string", required: false, description: "Bank name for referral payment" },
          { name: "doctor_account_number", type: "string", required: false, description: "Account number for referral payment" },
          { name: "doctor_account_name", type: "string", required: false, description: "Account name for referral payment" },
          { name: "diagnosis", type: "string", required: false, description: "Clinical diagnosis / notes (up to 2000 chars)" },
        ],
        responseExample: JSON.stringify(
          {
            success: true,
            code: "CDL-A3X9B1",
            lab: {
              name: "Central Diagnostics Lab",
              address: "12 Hospital Rd, Lagos",
              phones: ["+2348012345678"],
            },
          },
          null,
          2
        ),
        notes: [
          "The `code` returned is unique per lab and should be given to the patient.",
          "If `patient_email` is provided, a separate email is sent to the patient with their code.",
          "Email failures are logged but never block the response.",
        ],
      },
    ],
  },
  {
    id: "lab",
    label: "Lab Authenticated",
    icon: "🔬",
    color: "blue",
    endpoints: [
      {
        id: "lab-list-requests",
        method: "GET",
        path: "/api/lab/requests",
        summary: "List Lab's Requests",
        description:
          "Returns all requests for the authenticated lab user's laboratory, ordered newest first.",
        auth: "lab",
        responseExample: JSON.stringify(
          {
            success: true,
            requests: [
              {
                id: "uuid",
                code: "CDL-A3X9B1",
                patient_name: "John Doe",
                dob: "1985-06-15T00:00:00Z",
                sex: "male",
                tests: "FBC, LFT, RFT",
                status: "incoming",
                created_at: "2025-03-01T09:00:00Z",
                seen_at: null,
                completed_at: null,
                doctor_name: "Dr. Amara Obi",
                doctor_email: "amara@clinic.com",
              },
            ],
          },
          null,
          2
        ),
      },
      {
        id: "retrieve-request",
        method: "POST",
        path: "/api/requests/retrieve",
        summary: "Retrieve Request by Code",
        description:
          "Looks up a request by its unique code. If the request is currently `incoming`, it is automatically transitioned to `seen` and the referring doctor is notified by email.",
        auth: "lab",
        body: [
          { name: "code", type: "string", required: true, description: "The request code (e.g. CDL-A3X9B1) — case-insensitive" },
        ],
        responseExample: JSON.stringify(
          {
            success: true,
            request: {
              id: "uuid",
              code: "CDL-A3X9B1",
              status: "seen",
              patient_name: "John Doe",
              dob: "1985-06-15T00:00:00Z",
              sex: "male",
              address: "5 Broad St, Lagos",
              tests: "FBC, LFT",
              diagnosis: "Suspected anaemia",
              doctor_name: "Dr. Amara Obi",
              doctor_email: "amara@clinic.com",
              seen_at: "2025-03-01T10:30:00Z",
              lab: { name: "Central Diagnostics Lab", address: "12 Hospital Rd" },
            },
          },
          null,
          2
        ),
        notes: [
          "Code lookup is case-insensitive and whitespace-trimmed.",
          "Returns 403 if the code belongs to a different laboratory.",
          "Automatically transitions `incoming → seen` on first retrieval.",
        ],
      },
      {
        id: "update-status",
        method: "POST",
        path: "/api/requests/update-status",
        summary: "Update Request Status",
        description:
          "Transitions a request along the status chain: `incoming → seen → done`. Notifies the doctor when status reaches `done`.",
        auth: "lab",
        body: [
          { name: "requestId", type: "UUID", required: true, description: "The request's unique ID" },
          { name: "status", type: '"seen" | "done"', required: true, description: "Target status" },
        ],
        responseExample: JSON.stringify({ success: true, status: "done" }, null, 2),
        notes: [
          "Only valid transitions are allowed: incoming→seen, seen→done.",
          "Attempting an invalid transition returns HTTP 400.",
          "Doctor is notified by email when status becomes `done`.",
        ],
      },
      {
        id: "send-results",
        method: "POST",
        path: "/api/requests/send-results",
        summary: "Send Lab Results",
        description:
          "Delivers test results to the doctor and patient. Accepts PDF file attachments and/or a result link. If the request is still `seen`, it is transitioned to `done` automatically.",
        auth: "lab",
        body: [
          { name: "requestId", type: "string (form)", required: true, description: "The request ID (multipart form field)" },
          { name: "resultFiles", type: "File[] (PDF)", required: false, description: "One or more result PDF files" },
          { name: "resultLink", type: "string (URL)", required: false, description: "External link to results portal" },
          { name: "note", type: "string", required: false, description: "Optional note included in the email" },
          { name: "patientEmail", type: "string (email)", required: false, description: "Override patient email for this delivery" },
        ],
        responseExample: JSON.stringify({ success: true, status: "done" }, null, 2),
        notes: [
          "Request must be `multipart/form-data` (not JSON).",
          "At least one of `resultFiles` or `resultLink` is required.",
          "Patient email is used if on file; `patientEmail` override takes precedence.",
        ],
      },
    ],
  },
  {
    id: "admin",
    label: "Admin Endpoints",
    icon: "⚙️",
    color: "violet",
    endpoints: [
      {
        id: "admin-list-labs",
        method: "GET",
        path: "/api/admin/labs",
        summary: "List All Laboratories",
        description: "Returns all laboratories including hidden ones. Only accessible to admin users.",
        auth: "admin",
        params: [
          { name: "—", type: "—", required: false, description: "No query parameters" },
        ],
        responseExample: JSON.stringify(
          { success: true, labs: [{ id: "uuid", name: "Lab A", hidden: true }] },
          null,
          2
        ),
      },
      {
        id: "admin-create-lab",
        method: "POST",
        path: "/api/admin/create-lab",
        summary: "Create Laboratory",
        description:
          "Creates a new laboratory account. Automatically provisions a Supabase auth user for the lab and sends login credentials via email.",
        auth: "admin",
        body: [
          { name: "name", type: "string", required: true, description: "Laboratory display name" },
          { name: "prefix", type: "string", required: true, description: "Short unique prefix for request codes (e.g. CDL)" },
          { name: "email", type: "string (email)", required: true, description: "Lab login email address" },
          { name: "address", type: "string", required: false, description: "Lab physical address" },
          { name: "phones", type: "string[]", required: false, description: "Array of phone numbers" },
          { name: "description", type: "string", required: false, description: "Lab description text" },
          { name: "service_categories", type: "string[]", required: false, description: "List of service category names" },
          { name: "certifications", type: "string[]", required: false, description: "List of certification names" },
          { name: "hidden", type: "boolean", required: false, description: "Hide from public lab list (default: false)" },
        ],
        responseExample: JSON.stringify({ success: true, lab: { id: "uuid", name: "New Lab" } }, null, 2),
      },
      {
        id: "admin-update-lab",
        method: "PATCH",
        path: "/api/admin/labs/[id]",
        summary: "Update Laboratory",
        description: "Updates lab details. All fields are optional — only provided fields are updated.",
        auth: "admin",
        body: [
          { name: "name", type: "string", required: false, description: "New lab name" },
          { name: "address", type: "string", required: false, description: "New address" },
          { name: "description", type: "string", required: false, description: "New description" },
          { name: "phones", type: "string[]", required: false, description: "Updated phone list" },
          { name: "hidden", type: "boolean", required: false, description: "Show/hide from public list" },
          { name: "service_categories", type: "string[]", required: false, description: "Updated service categories" },
          { name: "certifications", type: "string[]", required: false, description: "Updated certifications" },
        ],
        responseExample: JSON.stringify({ success: true, lab: { id: "uuid", name: "Updated Lab" } }, null, 2),
      },
      {
        id: "admin-delete-lab",
        method: "DELETE",
        path: "/api/admin/labs/[id]",
        summary: "Delete Laboratory",
        description:
          "Permanently deletes a laboratory and all associated data (requests, lab users). Also removes the Supabase auth user. This action is irreversible.",
        auth: "admin",
        responseExample: JSON.stringify({ success: true }, null, 2),
        notes: ["This is a destructive operation — all lab data is permanently removed."],
      },
      {
        id: "admin-upload-logo",
        method: "POST",
        path: "/api/admin/labs/[id]/logo",
        summary: "Upload Lab Logo",
        description:
          "Uploads or replaces the logo for a laboratory. Stores in Supabase storage bucket `lab-logos`.",
        auth: "admin",
        body: [
          { name: "logo", type: "File (image)", required: true, description: "JPEG, PNG, WebP, or GIF image file (multipart/form-data)" },
        ],
        responseExample: JSON.stringify(
          { success: true, logo_url: "https://storage.supabase.co/lab-logos/uuid.jpg" },
          null,
          2
        ),
      },
      {
        id: "admin-list-requests",
        method: "GET",
        path: "/api/admin/requests",
        summary: "List All Requests",
        description:
          "Returns paginated requests with aggregate metrics. Supports filtering by lab and status.",
        auth: "admin",
        params: [
          { name: "lab_id", type: "UUID", required: false, description: "Filter by laboratory" },
          { name: "status", type: '"incoming" | "seen" | "done"', required: false, description: "Filter by status" },
          { name: "page", type: "number", required: false, description: "Page number (default: 1)" },
          { name: "limit", type: "number", required: false, description: "Results per page (max 100, default 50)" },
        ],
        responseExample: JSON.stringify(
          {
            success: true,
            requests: [],
            total: 0,
            page: 1,
            limit: 50,
            metrics: { incoming: 5, seen: 3, done: 42 },
          },
          null,
          2
        ),
      },
      {
        id: "admin-delete-request",
        method: "DELETE",
        path: "/api/admin/requests/[id]",
        summary: "Delete Request",
        description: "Permanently deletes a single request record.",
        auth: "admin",
        responseExample: JSON.stringify({ success: true }, null, 2),
      },
    ],
  },
];

/* ─── Helper components ──────────────────────────────────────────────── */
const METHOD_STYLES: Record<Method, string> = {
  GET: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  POST: "bg-blue-100 text-blue-800 border border-blue-200",
  PATCH: "bg-amber-100 text-amber-800 border border-amber-200",
  DELETE: "bg-red-100 text-red-800 border border-red-200",
};

const AUTH_BADGE: Record<AuthLevel, { label: string; style: string }> = {
  public: { label: "Public", style: "bg-slate-100 text-slate-600 border border-slate-200" },
  lab: { label: "Lab Auth", style: "bg-blue-50 text-blue-700 border border-blue-200" },
  admin: { label: "Admin Auth", style: "bg-violet-50 text-violet-700 border border-violet-200" },
};

const SECTION_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  public: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    badge: "bg-emerald-600",
  },
  lab: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    badge: "bg-blue-600",
  },
  admin: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-800",
    badge: "bg-violet-600",
  },
};

function MethodBadge({ method }: { method: Method }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono font-bold tracking-wide ${METHOD_STYLES[method]}`}>
      {method}
    </span>
  );
}

function AuthBadge({ auth }: { auth: AuthLevel }) {
  const { label, style } = AUTH_BADGE[auth];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${style}`}>
      {auth === "public" ? "🌐" : auth === "lab" ? "🔬" : "🔐"} {label}
    </span>
  );
}

function ParamTable({ params, title }: { params: Param[]; title: string }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</p>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Type</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Required</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {params.map((p) => (
              <tr key={p.name} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-3 py-2.5">
                  <code className="text-xs font-mono font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                    {p.name}
                  </code>
                </td>
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <code className="text-xs font-mono text-violet-700">{p.type}</code>
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell">
                  {p.required ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                      Required
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Optional</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-slate-600 text-xs">{p.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Response Example</p>
        <button
          onClick={copy}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800">
        {code}
      </pre>
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Header — always visible */}
      <button
        className="w-full text-left px-4 py-4 flex items-start gap-3 hover:bg-slate-50/50 transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex-shrink-0 mt-0.5">
          <MethodBadge method={endpoint.method} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <code className="text-sm font-mono font-semibold text-slate-800 break-all">
              {endpoint.path}
            </code>
            <AuthBadge auth={endpoint.auth} />
          </div>
          <p className="text-sm text-slate-600">{endpoint.summary}</p>
        </div>
        <span className="flex-shrink-0 text-slate-400 text-xs mt-1 ml-2 select-none">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="px-4 pb-5 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600 leading-relaxed mb-3">{endpoint.description}</p>

          {endpoint.notes && endpoint.notes.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4">
              <p className="text-xs font-semibold text-amber-700 mb-1.5">Notes</p>
              <ul className="space-y-1">
                {endpoint.notes.map((n, i) => (
                  <li key={i} className="text-xs text-amber-800 flex gap-2">
                    <span className="flex-shrink-0 mt-0.5">•</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {endpoint.params && endpoint.params.length > 0 && (
            <ParamTable params={endpoint.params} title="Query Parameters" />
          )}

          {endpoint.body && endpoint.body.length > 0 && (
            <ParamTable params={endpoint.body} title="Request Body" />
          )}

          <CodeBlock code={endpoint.responseExample} />
        </div>
      )}
    </div>
  );
}

function StatusFlow() {
  return (
    <div className="glass-card p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-800 mb-1">Request Status Workflow</h2>
      <p className="text-sm text-slate-500 mb-5">
        Every lab request moves through three stages. Transitions are strictly enforced server-side.
      </p>

      {/* Flow diagram */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-0 mb-6">
        {[
          {
            status: "incoming",
            label: "Incoming",
            icon: "📥",
            color: "bg-slate-100 border-slate-300 text-slate-700",
            desc: "Created by doctor",
          },
          {
            status: "seen",
            label: "Seen",
            icon: "👁",
            color: "bg-blue-100 border-blue-300 text-blue-700",
            desc: "Patient arrived",
          },
          {
            status: "done",
            label: "Done",
            icon: "✅",
            color: "bg-emerald-100 border-emerald-300 text-emerald-700",
            desc: "Results sent",
          },
        ].map((step, i) => (
          <div key={step.status} className="flex flex-col sm:flex-row items-center">
            <div className={`flex flex-col items-center p-4 rounded-2xl border-2 ${step.color} w-32 text-center`}>
              <span className="text-2xl mb-1">{step.icon}</span>
              <span className="font-bold text-sm">{step.label}</span>
              <span className="text-xs mt-1 opacity-70">{step.desc}</span>
            </div>
            {i < 2 && (
              <div className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-0 my-1 sm:my-0 sm:mx-2">
                <div className="w-0.5 h-4 sm:w-6 sm:h-0.5 bg-slate-300 rounded-full" />
                <span className="text-slate-400 text-xs sm:rotate-0 rotate-90">▶</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Trigger table */}
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Transition</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Trigger</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Email Sent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            <tr>
              <td className="px-3 py-2.5">
                <code className="text-xs font-mono text-slate-600">incoming → seen</code>
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-600">Lab retrieves request by code</td>
              <td className="px-3 py-2.5 text-xs text-slate-600 hidden sm:table-cell">Doctor: patient arrived notification</td>
            </tr>
            <tr>
              <td className="px-3 py-2.5">
                <code className="text-xs font-mono text-slate-600">seen → done</code>
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-600">Lab updates status or sends results</td>
              <td className="px-3 py-2.5 text-xs text-slate-600 hidden sm:table-cell">Doctor + Patient: tests completed / results ready</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuthSection() {
  return (
    <div className="glass-card p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-800 mb-1">Authentication</h2>
      <p className="text-sm text-slate-500 mb-4">
        The API uses three access levels. Credentials are passed via Supabase session cookies.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            level: "Public",
            icon: "🌐",
            color: "border-emerald-200 bg-emerald-50",
            textColor: "text-emerald-800",
            desc: "No authentication required. Any client can call these endpoints.",
            endpoints: ["/api/labs", "/api/requests/create"],
          },
          {
            level: "Lab Auth",
            icon: "🔬",
            color: "border-blue-200 bg-blue-50",
            textColor: "text-blue-800",
            desc: "Requires an active Supabase session for a lab user account.",
            endpoints: ["/api/lab/requests", "/api/requests/retrieve", "/api/requests/update-status", "/api/requests/send-results"],
          },
          {
            level: "Admin Auth",
            icon: "🔐",
            color: "border-violet-200 bg-violet-50",
            textColor: "text-violet-800",
            desc: "Requires a Supabase session for a verified AdminUser record.",
            endpoints: ["/api/admin/*"],
          },
        ].map((item) => (
          <div key={item.level} className={`rounded-2xl border p-4 ${item.color}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{item.icon}</span>
              <span className={`font-bold text-sm ${item.textColor}`}>{item.level}</span>
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">{item.desc}</p>
            <div className="space-y-1">
              {item.endpoints.map((ep) => (
                <code key={ep} className="block text-xs font-mono text-slate-700 bg-white/70 px-2 py-1 rounded-lg">
                  {ep}
                </code>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorCodes() {
  const codes = [
    { code: "200", label: "OK", desc: "Request succeeded" },
    { code: "400", label: "Bad Request", desc: "Validation failed or invalid input" },
    { code: "401", label: "Unauthorized", desc: "No valid session cookie present" },
    { code: "403", label: "Forbidden", desc: "Authenticated but insufficient permissions" },
    { code: "404", label: "Not Found", desc: "Resource does not exist" },
    { code: "500", label: "Server Error", desc: "Unexpected internal error" },
  ];
  return (
    <div className="glass-card p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-800 mb-1">HTTP Status Codes</h2>
      <p className="text-sm text-slate-500 mb-4">All error responses include a JSON body with <code className="text-xs bg-slate-100 px-1 rounded">success: false</code> and an <code className="text-xs bg-slate-100 px-1 rounded">error</code> message.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {codes.map((c) => (
          <div key={c.code} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
            <span className={`font-mono font-bold text-sm flex-shrink-0 ${
              c.code.startsWith("2") ? "text-emerald-600" :
              c.code.startsWith("4") ? "text-amber-600" : "text-red-600"
            }`}>
              {c.code}
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-700">{c.label}</p>
              <p className="text-xs text-slate-500">{c.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function ApiDocsClient() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      {/* Nav */}
      <nav className="border-b border-white/80 bg-white/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PoveonLogo className="w-8 h-8" />
            <span className="font-bold text-medical-700 text-lg">Poveon</span>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-medical-50 border border-medical-200 text-medical-700 text-xs font-medium ml-1">
              API Docs
            </span>
          </div>
          <a href="/" className="text-sm text-slate-500 hover:text-medical-700 transition-colors">
            ← Back to App
          </a>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 pb-20 pt-6">
        {/* Hero */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 bg-medical-100 text-medical-700 px-3 py-1 rounded-full text-xs font-semibold mb-3">
            <span>🧪</span> LIMS Integration Guide
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-3 leading-tight">
            Poveon API Documentation
          </h1>
          <p className="text-slate-500 text-base sm:text-lg leading-relaxed max-w-2xl">
            A complete reference for integrating with the Poveon laboratory request platform.
            All endpoints follow REST conventions and return JSON (unless noted).
          </p>
          {/* Quick stats */}
          <div className="flex flex-wrap gap-3 mt-5">
            {[
              { label: "Base URL", value: "https://your-domain.com" },
              { label: "Protocol", value: "HTTPS only" },
              { label: "Format", value: "JSON / FormData" },
              { label: "Auth", value: "Cookie-based" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 bg-white/80 border border-white/60 rounded-xl px-3 py-2 text-sm shadow-sm">
                <span className="font-semibold text-slate-700">{item.label}:</span>
                <code className="text-xs font-mono text-medical-700">{item.value}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Two-column layout on large screens */}
        <div className="flex gap-6 items-start">
          {/* Sticky sidebar (desktop only) */}
          <aside className="hidden lg:block w-52 flex-shrink-0 sticky top-20">
            <div className="glass-card p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Navigation</p>
              <nav className="space-y-1">
                {[
                  { id: "overview", label: "Overview", icon: "📋" },
                  { id: "auth-section", label: "Authentication", icon: "🔑" },
                  { id: "status-flow", label: "Status Workflow", icon: "🔄" },
                  ...sections.map((s) => ({ id: s.id, label: s.label, icon: s.icon })),
                  { id: "errors", label: "Status Codes", icon: "⚠️" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollTo(item.id)}
                    className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                      activeSection === item.id
                        ? "bg-medical-100 text-medical-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span className="leading-tight">{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-8">
            {/* Overview */}
            <section id="overview">
              <div className="glass-card p-5 sm:p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Overview</h2>
                <p className="text-sm text-slate-600 leading-relaxed mb-4">
                  The Poveon API enables healthcare systems and LIMS to automate lab request management.
                  You can create requests programmatically, track their lifecycle, deliver results,
                  and manage laboratory accounts — all through a clean REST interface.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { icon: "📝", title: "Request Creation", desc: "Doctors or integrated systems submit patient test requests without a login." },
                    { icon: "📡", title: "Real-time Status", desc: "Poll or webhook-trigger status checks as patients progress through the lab." },
                    { icon: "📄", title: "Result Delivery", desc: "Attach PDF results or share secure links directly to doctors and patients." },
                    { icon: "🏥", title: "Lab Management", desc: "Admin APIs let you provision and manage multiple lab accounts." },
                  ].map((card) => (
                    <div key={card.title} className="flex gap-3 p-3 bg-white/60 rounded-xl border border-white/80">
                      <span className="text-2xl flex-shrink-0">{card.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{card.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{card.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Auth */}
            <section id="auth-section">
              <AuthSection />
            </section>

            {/* Status workflow */}
            <section id="status-flow">
              <StatusFlow />
            </section>

            {/* Endpoint sections */}
            {sections.map((section) => {
              const colors = SECTION_COLORS[section.id];
              return (
                <section key={section.id} id={section.id}>
                  <div className={`rounded-2xl border ${colors.border} ${colors.bg} px-4 py-3 flex items-center gap-2 mb-4`}>
                    <span className="text-xl">{section.icon}</span>
                    <h2 className={`text-base font-bold ${colors.text}`}>{section.label}</h2>
                    <span className={`ml-auto text-white text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
                      {section.endpoints.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {section.endpoints.map((ep) => (
                      <EndpointCard key={ep.id} endpoint={ep} />
                    ))}
                  </div>
                </section>
              );
            })}

            {/* Error codes */}
            <section id="errors">
              <ErrorCodes />
            </section>

            {/* Footer CTA */}
            <div className="glass-card p-5 sm:p-6 text-center">
              <p className="text-2xl mb-2">🚀</p>
              <h3 className="font-bold text-slate-800 mb-1">Ready to integrate?</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Contact the Poveon team to get API credentials and onboard your LIMS or healthcare system.
              </p>
              <a
                href="mailto:support@poveon.com"
                className="inline-flex items-center gap-2 mt-4 bg-medical-600 hover:bg-medical-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                Get in touch
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/60 bg-white/40 backdrop-blur-sm py-6">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Poveon. API Documentation v1.0</span>
          <div className="flex items-center gap-4">
            <a href="/terms" className="hover:text-slate-600 transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
