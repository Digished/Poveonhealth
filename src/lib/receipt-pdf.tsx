import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// Built-in Helvetica — no font download (same approach as the result report PDF).
const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1a1a2e", paddingTop: 44, paddingBottom: 56, paddingHorizontal: 48, lineHeight: 1.5 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#0f172a", paddingBottom: 10, marginBottom: 14 },
  labName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  labMeta: { fontSize: 8, color: "#64748b", marginTop: 2 },
  reportTitle: { fontSize: 9, color: "#64748b", marginTop: 4, letterSpacing: 0.5, textTransform: "uppercase" },
  metaRight: { alignItems: "flex-end" },
  metaDate: { fontSize: 9, color: "#64748b" },
  receiptNo: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0259a0", letterSpacing: 1, marginTop: 2 },
  codeText: { fontSize: 9, color: "#64748b", marginTop: 2 },
  sectionLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 },
  card: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 10, marginBottom: 14 },
  row: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "33.33%", marginBottom: 6, paddingRight: 8 },
  fieldLabel: { fontSize: 7, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 },
  fieldValue: { fontSize: 10, color: "#0f172a", fontFamily: "Helvetica-Bold", marginTop: 1 },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingBottom: 4, marginBottom: 2 },
  tr: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#eef2f7" },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  cItem: { width: "52%" }, cQty: { width: "12%", textAlign: "right" }, cPrice: { width: "18%", textAlign: "right" }, cAmount: { width: "18%", textAlign: "right" },
  cell: { fontSize: 9.5, color: "#1e293b" },
  amountVal: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#cbd5e1" },
  totalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#0f172a", marginRight: 12 },
  totalVal: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#0259a0" },
  noteBox: { marginTop: 14, backgroundColor: "#f0f7ff", borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 6, padding: 10 },
  noteText: { fontSize: 9.5, color: "#1e293b", lineHeight: 1.6 },
  paidStamp: { marginTop: 16, alignSelf: "flex-start", borderWidth: 1.5, borderColor: "#059669", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  paidStampText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#059669", letterSpacing: 2 },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 8 },
  footerText: { fontSize: 7.5, color: "#94a3b8" },
});

export type ReceiptItem = { name: string; qty?: number; unit_price?: number; amount?: number };

export type ReceiptProps = {
  labName: string;
  labAddress?: string | null;
  labPhone?: string | null;
  receiptNo: number;
  kind: string; // payment | collection
  issuedAt: Date;
  code: string; // request code
  currency: string; // e.g. NGN
  amount: number;
  items: ReceiptItem[];
  paymentMode?: string | null;
  note?: string | null;
  issuedBy?: string | null;
  patientName?: string | null;
  patientPhone?: string | null;
};

const CURRENCY_SYMBOL: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

function money(currency: string, n: number): string {
  const sym = CURRENCY_SYMBOL[currency] ?? "";
  return `${sym}${(n ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function paymentModeLabel(mode?: string | null): string {
  if (!mode) return "—";
  return { cash: "Cash", card: "Card", transfer: "Transfer", bill_hospital: "Billed to hospital", hmo: "HMO" }[mode] ?? mode;
}

export function ReceiptPdf(props: ReceiptProps) {
  const isPayment = props.kind !== "collection";
  const title = isPayment ? "Payment Receipt" : "Specimen Collection Slip";
  const dateStr = props.issuedAt.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <Document title={`Receipt ${props.receiptNo}`} author={props.labName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.labName}>{props.labName}</Text>
            {props.labAddress ? <Text style={styles.labMeta}>{props.labAddress}</Text> : null}
            {props.labPhone ? <Text style={styles.labMeta}>{props.labPhone}</Text> : null}
            <Text style={styles.reportTitle}>{title}</Text>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.metaDate}>{dateStr}</Text>
            <Text style={styles.receiptNo}>Receipt #{String(props.receiptNo).padStart(5, "0")}</Text>
            <Text style={styles.codeText}>Req {props.code}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Billed to</Text>
          <View style={styles.row}>
            <View style={styles.field}><Text style={styles.fieldLabel}>Name</Text><Text style={styles.fieldValue}>{props.patientName ?? "—"}</Text></View>
            <View style={styles.field}><Text style={styles.fieldLabel}>Phone</Text><Text style={styles.fieldValue}>{props.patientPhone ?? "—"}</Text></View>
            {isPayment ? <View style={styles.field}><Text style={styles.fieldLabel}>Payment mode</Text><Text style={styles.fieldValue}>{paymentModeLabel(props.paymentMode)}</Text></View> : null}
          </View>
        </View>

        <View style={styles.thead}>
          <Text style={[styles.th, styles.cItem]}>Item</Text>
          <Text style={[styles.th, styles.cQty]}>Qty</Text>
          {isPayment ? <Text style={[styles.th, styles.cPrice]}>Unit price</Text> : null}
          {isPayment ? <Text style={[styles.th, styles.cAmount]}>Amount</Text> : null}
        </View>
        {props.items.length === 0 ? (
          <View style={styles.tr}><Text style={[styles.cell, styles.cItem]}>—</Text></View>
        ) : props.items.map((it, i) => (
          <View key={i} style={styles.tr}>
            <Text style={[styles.cell, styles.cItem]}>{it.name}</Text>
            <Text style={[styles.cell, styles.cQty]}>{it.qty ?? 1}</Text>
            {isPayment ? <Text style={[styles.cell, styles.cPrice]}>{it.unit_price != null ? money(props.currency, it.unit_price) : "—"}</Text> : null}
            {isPayment ? <Text style={[styles.amountVal, styles.cAmount]}>{it.amount != null ? money(props.currency, it.amount) : "—"}</Text> : null}
          </View>
        ))}

        {isPayment ? (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total paid</Text>
            <Text style={styles.totalVal}>{money(props.currency, props.amount)}</Text>
          </View>
        ) : null}

        {isPayment ? (
          <View style={styles.paidStamp}><Text style={styles.paidStampText}>PAID</Text></View>
        ) : null}

        {props.note ? (
          <View style={styles.noteBox}>
            <Text style={styles.sectionLabel}>Note</Text>
            <Text style={styles.noteText}>{props.note}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{props.labName}{props.issuedBy ? ` · Issued by ${props.issuedBy}` : ""} · Powered by Poveon</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
