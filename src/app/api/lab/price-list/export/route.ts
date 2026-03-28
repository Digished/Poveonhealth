export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/lab/price-list/export?format=csv|xlsx
 *
 * Downloads the lab's price list as a CSV or Excel file.
 * CSV is built server-side (no extra deps).
 * XLSX uses the `xlsx` package already in the project.
 *
 * Query params:
 *   format  – "csv" (default) | "xlsx"
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = request.nextUrl.searchParams.get("format") ?? "csv";

  const [lab, tests] = await Promise.all([
    prisma.lab.findUnique({ where: { id: auth.lab_id }, select: { name: true } }),
    prisma.labOfferedTest.findMany({
      where: { lab_id: auth.lab_id },
      orderBy: [{ category_label: "asc" }, { raw_name: "asc" }],
      select: {
        raw_name: true,
        category_label: true,
        lab_price: true,
        poveon_fee: true,
        commission_pct: true,
        is_active: true,
        updated_at: true,
      },
    }),
  ]);

  const labName = (lab?.name ?? "lab").toLowerCase().replace(/\s+/g, "-");
  const today = new Date().toISOString().split("T")[0];
  const baseFilename = `${labName}-price-list-${today}`;

  // ── CSV ────────────────────────────────────────────────────────────────────
  if (format !== "xlsx") {
    const headers = ["Test Name", "Category", "Your Price (₦)", "Commission %", "Poveon Fee (₦)", "Active", "Last Updated"];
    const rows = tests.map((t) => [
      `"${t.raw_name.replace(/"/g, '""')}"`,
      `"${(t.category_label ?? "").replace(/"/g, '""')}"`,
      Number(t.lab_price).toFixed(2),
      t.commission_pct ? Number(t.commission_pct).toFixed(2) : "",
      t.poveon_fee ? Number(t.poveon_fee).toFixed(2) : "",
      t.is_active ? "Yes" : "No",
      t.updated_at.toISOString().split("T")[0],
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseFilename}.csv"`,
      },
    });
  }

  // ── XLSX ───────────────────────────────────────────────────────────────────
  try {
    // Dynamic import so CSV path doesn't pay the xlsx bundle cost
    const XLSX = await import("xlsx");

    const sheetData = [
      ["Test Name", "Category", "Your Price (₦)", "Commission %", "Poveon Fee (₦)", "Active", "Last Updated"],
      ...tests.map((t) => [
        t.raw_name,
        t.category_label ?? "",
        Number(t.lab_price),
        t.commission_pct ? Number(t.commission_pct) : "",
        t.poveon_fee ? Number(t.poveon_fee) : "",
        t.is_active ? "Yes" : "No",
        t.updated_at.toISOString().split("T")[0],
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Column widths
    ws["!cols"] = [
      { wch: 40 }, // Test Name
      { wch: 22 }, // Category
      { wch: 16 }, // Price
      { wch: 14 }, // Commission %
      { wch: 16 }, // Poveon Fee
      { wch: 8 },  // Active
      { wch: 14 }, // Last Updated
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Price List");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseFilename}.xlsx"`,
      },
    });
  } catch {
    // Fallback to CSV if xlsx fails
    const headers = ["Test Name", "Category", "Your Price (₦)", "Commission %", "Poveon Fee (₦)", "Active", "Last Updated"];
    const rows = tests.map((t) => [
      `"${t.raw_name.replace(/"/g, '""')}"`,
      `"${(t.category_label ?? "").replace(/"/g, '""')}"`,
      Number(t.lab_price).toFixed(2),
      t.commission_pct ? Number(t.commission_pct).toFixed(2) : "",
      t.poveon_fee ? Number(t.poveon_fee).toFixed(2) : "",
      t.is_active ? "Yes" : "No",
      t.updated_at.toISOString().split("T")[0],
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseFilename}.csv"`,
      },
    });
  }
}
