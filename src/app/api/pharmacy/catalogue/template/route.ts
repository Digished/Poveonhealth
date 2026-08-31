export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { getPharmacyFromRequest } from "@/lib/consult";
import { MED_SHEET_TEMPLATE } from "@/lib/med-sheet";

/**
 * GET /api/pharmacy/catalogue/template — the spreadsheet to fill in.
 *
 * The parser copes with whatever headers a pharmacy already uses, but handing
 * them the shape we expect turns most uploads into no guessing at all.
 */
export async function GET(req: NextRequest) {
  const pharmacy = await getPharmacyFromRequest(req);
  if (!pharmacy) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const sheet = xlsx.utils.aoa_to_sheet(MED_SHEET_TEMPLATE);
  sheet["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 24 }];
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, "Price list");
  const buffer = xlsx.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="poveon-price-list.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
