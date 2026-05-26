export type LabSlaData = {
  effectiveDate: string;
  labName: string;
  labRcNumber: string;
  labAddress: string;
  ceoName: string;
  ceoTitle: string;
  signatureDataUrl: string | null;
};

export const EMPTY_LAB_SLA: LabSlaData = {
  effectiveDate: "",
  labName: "",
  labRcNumber: "",
  labAddress: "",
  ceoName: "",
  ceoTitle: "",
  signatureDataUrl: null,
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Render a value, or an underlined blank of the given width when empty.
function field(value: string, blankCh = 28): string {
  const trimmed = value.trim();
  return trimmed ? esc(trimmed) : "&nbsp;".repeat(blankCh);
}

export function renderLabSla(data: LabSlaData): string {
  const sigBlock = data.signatureDataUrl
    ? `<img src="${data.signatureDataUrl}" alt="Signature" style="max-height:40px;max-width:200px;display:block;margin-bottom:2px;" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Laboratory Service Level Agreement &mdash; Poveon LTD</title>
<style>
  :root { --ink:#111111; --muted:#555555; --line:#d8d8d8; --accent:#000000; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #f4f4f4; color: var(--ink);
    font-family: "Helvetica Neue", Arial, sans-serif; font-size: 12pt; line-height: 1.6;
  }
  .page {
    max-width: 820px; margin: 24px auto; background: #ffffff;
    padding: 56px 64px; box-shadow: 0 1px 8px rgba(0,0,0,0.12);
  }
  header.doc-head {
    display: flex; align-items: center; gap: 20px;
    border-bottom: 3px solid var(--accent); padding-bottom: 20px; margin-bottom: 8px;
  }
  header.doc-head .logo { width: 64px; height: 64px; flex: none; }
  header.doc-head .logo svg { width: 100%; height: 100%; }
  header.doc-head .company h1 { margin: 0; font-size: 22pt; letter-spacing: 0.5px; }
  header.doc-head .company p {
    margin: 2px 0 0; color: var(--muted); font-size: 9.5pt;
    text-transform: uppercase; letter-spacing: 1.2px;
  }
  h2.title {
    text-align: center; font-size: 16pt; margin: 28px 0 4px;
    text-transform: uppercase; letter-spacing: 1px;
  }
  p.subtitle { text-align: center; color: var(--muted); margin: 0 0 28px; font-size: 10pt; }
  h3 {
    font-size: 12pt; margin: 26px 0 6px; text-transform: uppercase;
    letter-spacing: 0.6px; border-bottom: 1px solid var(--line); padding-bottom: 4px;
  }
  p { margin: 8px 0; text-align: justify; }
  ul { margin: 8px 0; padding-left: 22px; }
  li { margin: 5px 0; }
  table.kv { width: 100%; border-collapse: collapse; margin: 12px 0; }
  table.kv td { border: 1px solid var(--line); padding: 8px 12px; vertical-align: top; }
  table.kv td.label { width: 38%; background: #fafafa; font-weight: bold; }
  .parties { display: flex; gap: 24px; margin: 16px 0; }
  .parties .party { flex: 1; border: 1px solid var(--line); padding: 12px 16px; }
  .parties .party h4 {
    margin: 0 0 6px; font-size: 10pt; text-transform: uppercase;
    letter-spacing: 0.8px; color: var(--muted);
  }
  .signatures { display: flex; gap: 48px; margin-top: 48px; }
  .signatures .sig { flex: 1; }
  .signatures .line { border-bottom: 1px solid var(--ink); height: 44px; margin-bottom: 6px; }
  .signatures .field { font-size: 9.5pt; color: var(--muted); margin: 4px 0; }
  footer.doc-foot {
    margin-top: 40px; border-top: 1px solid var(--line); padding-top: 12px;
    text-align: center; color: var(--muted); font-size: 8.5pt;
  }
  .note {
    background: #fafafa; border-left: 3px solid var(--accent);
    padding: 10px 16px; margin: 14px 0; font-size: 11pt;
  }
  @media print {
    body { background: #fff; }
    .page { box-shadow: none; margin: 0; max-width: none; padding: 0; }
    h3 { page-break-after: avoid; }
  }
</style>
</head>
<body>

<div class="page">

  <header class="doc-head">
    <div class="logo">
      <svg viewBox="0 0 181 179" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M67 113C67 115.761 64.7614 118 62 118H48.9421C47.6928 118 46.4888 117.532 45.5671 116.689L9.49732 83.689C6.13115 80.6093 8.30997 75 12.8724 75H62C64.7614 75 67 77.2386 67 80V113Z" fill="black"/>
        <path d="M116 67C118.761 67 121 64.7614 121 62V48.9421C121 47.6929 120.532 46.4888 119.689 45.5671L86.689 9.49732C83.6093 6.13115 78 8.30997 78 12.8724L78 62C78 64.7614 80.2386 67 83 67H116Z" fill="black"/>
        <path d="M169.603 107.573C173.643 111.269 171.028 118 165.553 118H127C123.686 118 121 120.686 121 124V177.73C121 178.431 120.431 179 119.73 179C119.374 179 119.034 178.85 118.793 178.587L79.5732 135.72C78.5612 134.613 78 133.169 78 131.669V81C78 77.6863 80.6863 75 84 75H131.669C133.169 75 134.613 75.5612 135.72 76.5732L169.603 107.573Z" fill="black"/>
      </svg>
    </div>
    <div class="company">
      <h1>POVEON LTD</h1>
      <p>RC8921141 &nbsp;&bull;&nbsp; +234 916 701 5451</p>
    </div>
  </header>

  <h2 class="title">Laboratory Service Level Agreement</h2>
  <p class="subtitle">Partnership terms for laboratories operating on the Poveon platform</p>

  <h3>1. Parties</h3>
  <p>This Service Level Agreement (the &ldquo;Agreement&rdquo;) is entered into between:</p>
  <div class="parties">
    <div class="party">
      <h4>The Company</h4>
      <strong>Poveon LTD</strong><br />
      CAC Registration No.: RC8921141<br />
      Phone: +234 916 701 5451<br />
      (&ldquo;Poveon&rdquo;)
    </div>
    <div class="party">
      <h4>The Laboratory</h4>
      Name: ${field(data.labName)}<br />
      Registration No.: ${field(data.labRcNumber, 22)}<br />
      Address: ${field(data.labAddress, 24)}<br />
      (the &ldquo;Laboratory&rdquo;)
    </div>
  </div>
  <p>Poveon and the Laboratory are each a &ldquo;Party&rdquo; and together the &ldquo;Parties&rdquo;.</p>

  <h3>2. Purpose</h3>
  <p>This Agreement sets out the terms under which the Laboratory is listed on, and receives diagnostic test referrals through, the Poveon platform, and the commercial terms governing that relationship.</p>

  <h3>3. Free Trial Period</h3>
  <p>Poveon grants the Laboratory a <strong>one (1) month free trial</strong>, commencing on the Effective Date stated below. During the trial period the Laboratory enjoys full access to the platform and receives test referrals at <strong>no commission and no cost</strong>.</p>
  <p>Upon expiry of the trial period, the commission terms in Section 4 take effect automatically unless either Party terminates this Agreement in writing before the trial ends.</p>

  <h3>4. Commission</h3>
  <p>Following the free trial period, the Laboratory shall pay Poveon a commission of <strong>two percent (2%)</strong> of the value of <strong>every fulfilled test</strong> referred to or processed through the Poveon platform. A test is considered &ldquo;fulfilled&rdquo; once the Laboratory has carried out the test and issued or made available the result.</p>
  <p>The 2% commission is calculated on the price charged by the Laboratory for each fulfilled test.</p>

  <h3>5. Transparency Obligation</h3>
  <div class="note">
    Poveon does not currently track fulfilled tests automatically. This Agreement therefore relies on the good faith and full transparency of the Laboratory.
  </div>
  <p>The Laboratory agrees to:</p>
  <ul>
    <li>Keep a complete and accurate record of every test referred through or associated with the Poveon platform;</li>
    <li>Honestly and fully report all fulfilled tests, including the test type, the price charged, and the date fulfilled;</li>
    <li>Not conceal, under-report, or misrepresent any fulfilled test in order to reduce commission payable;</li>
    <li>Make its records available to Poveon for reasonable verification on request.</li>
  </ul>
  <p>The Laboratory acknowledges that the integrity of this partnership depends on honest reporting. Deliberate misreporting is a material breach of this Agreement.</p>

  <h3>6. Reporting and Payment</h3>
  <p>On a <strong>monthly</strong> basis, the Laboratory shall submit to Poveon a self-report of all tests fulfilled through the platform during the preceding calendar month. Poveon will review the report and the commission of 2% of the total reported value shall become due and payable.</p>
  <p>Commission payments shall be made to the following account:</p>
  <table class="kv">
    <tr><td class="label">Account Name</td><td>Poveon LTD</td></tr>
    <tr><td class="label">Account Number</td><td>3003636445</td></tr>
    <tr><td class="label">Bank</td><td>Kuda MFB</td></tr>
  </table>
  <p>Payment shall be made within seven (7) days of the commission becoming due.</p>

  <h3>7. Service Standards</h3>
  <p>The Laboratory shall:</p>
  <ul>
    <li>Process referred tests promptly and to recognised professional and regulatory standards;</li>
    <li>Maintain valid licences and accreditations required to operate as a diagnostic laboratory;</li>
    <li>Keep test pricing accurate and up to date on the platform;</li>
    <li>Treat patient information and results with confidentiality and in line with applicable law.</li>
  </ul>
  <p>Poveon shall maintain the platform, list the Laboratory in good faith, and direct genuine test referrals to the Laboratory.</p>

  <h3>8. Term and Termination</h3>
  <p>This Agreement begins on the Effective Date and continues until terminated. Either Party may terminate this Agreement by giving <strong>thirty (30) days&rsquo; written notice</strong> to the other Party. Poveon may terminate immediately if the Laboratory commits a material breach, including dishonest reporting under Section 5. All commission accrued up to the date of termination remains payable.</p>

  <h3>9. Confidentiality</h3>
  <p>Each Party shall keep confidential all non-public information disclosed by the other Party in connection with this Agreement and shall use it only for the purposes of this Agreement.</p>

  <h3>10. Governing Law</h3>
  <p>This Agreement is governed by and construed in accordance with the laws of the Federal Republic of Nigeria. The Parties shall seek to resolve any dispute amicably; failing which the dispute shall be subject to the jurisdiction of the courts of Nigeria.</p>

  <h3>11. Acceptance</h3>
  <p>By signing below, the Parties confirm that they have read, understood, and agreed to be bound by the terms of this Agreement.</p>

  <table class="kv">
    <tr><td class="label">Effective Date</td><td>${field(data.effectiveDate, 30)}</td></tr>
  </table>

  <div class="signatures">
    <div class="sig">
      ${sigBlock}
      <div class="line"></div>
      <p class="field"><strong>For Poveon LTD</strong></p>
      <p class="field">Name: ${field(data.ceoName, 20)}</p>
      <p class="field">Title: ${field(data.ceoTitle, 20)}</p>
      <p class="field">Date: ${field(data.effectiveDate, 20)}</p>
    </div>
    <div class="sig">
      <div class="line" style="margin-top:46px;"></div>
      <p class="field"><strong>For the Laboratory</strong></p>
      <p class="field">Name: ${"&nbsp;".repeat(20)}</p>
      <p class="field">Title: ${"&nbsp;".repeat(20)}</p>
      <p class="field">Date: ${"&nbsp;".repeat(20)}</p>
    </div>
  </div>

  <footer class="doc-foot">
    Poveon LTD &nbsp;&bull;&nbsp; CAC RC8921141 &nbsp;&bull;&nbsp; +234 916 701 5451 &nbsp;&bull;&nbsp; Laboratory Service Level Agreement
  </footer>

</div>

</body>
</html>`;
}
