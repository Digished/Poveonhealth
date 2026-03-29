/**
 * Google Sheets integration helpers.
 *
 * Handles:
 * - OAuth2 client construction
 * - Spreadsheet creation (one tab per category, with formatting)
 * - Push: write Poveon DB data → Google Sheet
 * - Pull: read Google Sheet → return raw rows for diffing
 */

import { google, sheets_v4 } from "googleapis";
import { decrypt } from "./encrypt";

export const SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

/** Derive the OAuth callback URL from the incoming request so it works on
 *  any deployment (local, preview, production) without extra config. */
export function getRedirectUri(requestUrl: string): string {
  const { origin } = new URL(requestUrl);
  return `${origin}/api/lab/sheets/callback`;
}

/** Build an OAuth2 client (unauthenticated — used for generating the auth URL). */
export function buildOAuthClient(redirectUri: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

/** Build an authenticated OAuth2 client for a lab using its stored encrypted refresh token.
 *  The redirect URI must match the one used during the original OAuth flow. */
export function buildAuthenticatedClient(encryptedRefreshToken: string, redirectUri: string) {
  const client = buildOAuthClient(redirectUri);
  client.setCredentials({ refresh_token: decrypt(encryptedRefreshToken) });
  return client;
}

// ── Sheet structure constants ─────────────────────────────────────────────────

export const HEADER_ROW = ["Test Name", "Price (₦)", "Active"];
const HELP_SHEET_TITLE = "Help & Instructions";

/** Row 1 background colour for category sheet headers (blue-grey). */
const HEADER_BG = { red: 0.13, green: 0.31, blue: 0.47 }; // #213F78-ish
const HEADER_FG = { red: 1, green: 1, blue: 1 };

// ── Spreadsheet creation ──────────────────────────────────────────────────────

export interface SheetTest {
  raw_name: string;
  lab_price: number;
  is_active: boolean;
}

export interface SheetCategory {
  label: string; // category name → becomes the sheet tab title
  tests: SheetTest[];
}

/**
 * Create a brand-new Google Spreadsheet for the lab.
 * Returns the spreadsheet ID.
 */
export async function createSpreadsheet(
  encryptedRefreshToken: string,
  redirectUri: string,
  labName: string,
  categories: SheetCategory[]
): Promise<string> {
  const auth = buildAuthenticatedClient(encryptedRefreshToken, redirectUri);
  const sheetsApi = google.sheets({ version: "v4", auth });

  // 1. Create spreadsheet with one sheet per category + the help tab
  const categoryTitles = categories.map((c) => c.label || "Uncategorized");
  const allTitles = [...categoryTitles, HELP_SHEET_TITLE];

  const createRes = await sheetsApi.spreadsheets.create({
    requestBody: {
      properties: { title: `${labName} – Price List` },
      sheets: allTitles.map((title, index) => ({
        properties: {
          sheetId: index,
          title,
          gridProperties: { frozenRowCount: title === HELP_SHEET_TITLE ? 0 : 1 },
        },
      })),
    },
  });

  const spreadsheetId = createRes.data.spreadsheetId!;

  // 2. Write data + formatting via batchUpdate
  const requests: sheets_v4.Schema$Request[] = [];

  // Format each category sheet
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const sheetId = i;
    const rows: string[][] = [
      HEADER_ROW,
      ...cat.tests.map((t) => [t.raw_name, String(t.lab_price), t.is_active ? "Yes" : "No"]),
    ];

    // Write data
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `'${cat.label || "Uncategorized"}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });

    // Style the header row
    requests.push(
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: HEADER_BG,
              textFormat: { foregroundColor: HEADER_FG, bold: true, fontSize: 11 },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
        },
      },
      // Format Price column as number
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } },
          },
          fields: "userEnteredFormat.numberFormat",
        },
      },
      // Data validation: Active column = Yes / No dropdown
      {
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 },
          rule: {
            condition: {
              type: "ONE_OF_LIST",
              values: [{ userEnteredValue: "Yes" }, { userEnteredValue: "No" }],
            },
            showCustomUi: true,
            strict: true,
          },
        },
      },
      // Auto-resize columns A and B
      { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 2 } } }
    );
  }

  // Write help tab content
  const helpSheetId = allTitles.length - 1;
  const helpRows = [
    ["Poveon Health – Price List Instructions"],
    [""],
    ["COLUMN GUIDE"],
    ["Test Name", "The name of the test exactly as it appears in your lab system."],
    ["Price (₦)", "The price you charge patients. Enter numbers only (e.g. 5000, not ₦5,000)."],
    ["Active", 'Type "Yes" to make the test available, "No" to hide it from patients.'],
    [""],
    ["HOW TO SYNC"],
    ["1.", "Edit any test name, price, or Active status in this spreadsheet."],
    ["2.", "Go to the Poveon Dashboard → Price List tab."],
    ["3.", 'Click "Pull from Sheet" to preview your changes before applying.'],
    ["4.", 'Click "Confirm" to save the changes to your Poveon account.'],
    [""],
    ["ADDING NEW TESTS"],
    ["•", "Add a new row in any category tab with the test name, price, and Active = Yes."],
    ["•", "Poveon will automatically generate search synonyms for the new test."],
    [""],
    ["TIPS"],
    ["•", "Do not delete or rename the sheet tabs (categories)."],
    ["•", "Do not edit column headers (row 1 in each tab)."],
    ["•", "If you need a new category, contact Poveon support."],
  ];

  await sheetsApi.spreadsheets.values.update({
    spreadsheetId,
    range: `'${HELP_SHEET_TITLE}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: helpRows },
  });

  // Style the help sheet title
  requests.push(
    {
      repeatCell: {
        range: { sheetId: helpSheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 14 },
          },
        },
        fields: "userEnteredFormat.textFormat",
      },
    },
    {
      repeatCell: {
        range: { sheetId: helpSheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat",
      },
    },
    {
      repeatCell: {
        range: { sheetId: helpSheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat",
      },
    },
    {
      repeatCell: {
        range: { sheetId: helpSheetId, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat",
      },
    },
    {
      autoResizeDimensions: {
        dimensions: { sheetId: helpSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 2 },
      },
    }
  );

  if (requests.length > 0) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }

  return spreadsheetId;
}

// ── Push (Poveon → Sheet) ─────────────────────────────────────────────────────

/**
 * Overwrite all category sheets with the current Poveon data.
 * Preserves the Help tab. Adds new sheets for new categories, removes sheets
 * for categories that no longer exist.
 */
export async function pushToSheet(
  encryptedRefreshToken: string,
  redirectUri: string,
  spreadsheetId: string,
  categories: SheetCategory[]
): Promise<void> {
  const auth = buildAuthenticatedClient(encryptedRefreshToken, redirectUri);
  const sheetsApi = google.sheets({ version: "v4", auth });

  // Get current sheet metadata
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const existingSheets = meta.data.sheets ?? [];

  const existingTitles = existingSheets.map((s) => s.properties?.title ?? "");
  const categoryTitles = categories.map((c) => c.label || "Uncategorized");

  const requests: sheets_v4.Schema$Request[] = [];

  // Add sheets for new categories
  for (const title of categoryTitles) {
    if (!existingTitles.includes(title)) {
      requests.push({
        addSheet: {
          properties: {
            title,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      });
    }
  }

  // Delete sheets for removed categories (never delete Help tab or unknown sheets)
  for (const sheet of existingSheets) {
    const title = sheet.properties?.title ?? "";
    if (title !== HELP_SHEET_TITLE && !categoryTitles.includes(title)) {
      requests.push({ deleteSheet: { sheetId: sheet.properties?.sheetId! } });
    }
  }

  if (requests.length > 0) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }

  // Re-fetch sheet metadata after structural changes
  const updatedMeta = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const updatedSheets = updatedMeta.data.sheets ?? [];

  const formatRequests: sheets_v4.Schema$Request[] = [];

  // Write data for each category
  for (const cat of categories) {
    const title = cat.label || "Uncategorized";
    const sheet = updatedSheets.find((s) => s.properties?.title === title);
    const sheetId = sheet?.properties?.sheetId ?? 0;

    const rows: string[][] = [
      HEADER_ROW,
      ...cat.tests.map((t) => [t.raw_name, String(t.lab_price), t.is_active ? "Yes" : "No"]),
    ];

    // Clear existing content, then write fresh data
    await sheetsApi.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${title}'`,
    });

    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `'${title}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });

    // Re-apply formatting & validation
    formatRequests.push(
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: HEADER_BG,
              textFormat: { foregroundColor: HEADER_FG, bold: true, fontSize: 11 },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } },
          },
          fields: "userEnteredFormat.numberFormat",
        },
      },
      {
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 },
          rule: {
            condition: {
              type: "ONE_OF_LIST",
              values: [{ userEnteredValue: "Yes" }, { userEnteredValue: "No" }],
            },
            showCustomUi: true,
            strict: true,
          },
        },
      }
    );
  }

  if (formatRequests.length > 0) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: formatRequests },
    });
  }
}

// ── Pull (Sheet → raw rows) ───────────────────────────────────────────────────

export interface SheetRow {
  raw_name: string;
  lab_price: number;
  is_active: boolean;
  category: string;
}

/**
 * Read all category sheets and return flat array of rows.
 * Skips the Help tab and any empty rows.
 */
export async function readFromSheet(
  encryptedRefreshToken: string,
  redirectUri: string,
  spreadsheetId: string
): Promise<SheetRow[]> {
  const auth = buildAuthenticatedClient(encryptedRefreshToken, redirectUri);
  const sheetsApi = google.sheets({ version: "v4", auth });

  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const sheets = (meta.data.sheets ?? []).filter(
    (s) => s.properties?.title !== HELP_SHEET_TITLE
  );

  const rows: SheetRow[] = [];

  for (const sheet of sheets) {
    const title = sheet.properties?.title ?? "Uncategorized";
    const res = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: `'${title}'`,
    });

    const values = res.data.values ?? [];
    // Skip header row (index 0)
    for (let i = 1; i < values.length; i++) {
      const [name, priceRaw, activeRaw] = values[i];
      if (!name || name.toString().trim() === "") continue;

      const price = parseFloat(String(priceRaw ?? "0").replace(/[^0-9.]/g, ""));
      const isActive = String(activeRaw ?? "Yes").trim().toLowerCase() !== "no";

      rows.push({
        raw_name: name.toString().trim(),
        lab_price: isNaN(price) ? 0 : price,
        is_active: isActive,
        category: title,
      });
    }
  }

  return rows;
}
