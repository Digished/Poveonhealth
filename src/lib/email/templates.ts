// =============================================================================
// POVEON HEALTH - EMAIL HTML TEMPLATES
// All styles are inline for email client compatibility
// =============================================================================

/**
 * brand — when a lab has a custom notification_email, pass { name: lab.name }
 * so the email header shows the lab's name rather than "Poveon".
 * A "Powered by Poveon" line is appended to branded emails for transparency.
 */
const base = (content: string, brand?: { name: string }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brand ? brand.name : "Poveon"}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f7ff;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f7ff;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0259a0,#0270c3);border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
                ${brand ? brand.name : "Poveon"}
              </h1>
              <p style="margin:4px 0 0;color:#bae0fd;font-size:13px;">
                ${brand ? "Laboratory Notifications" : "Laboratory Request Management"}
              </p>
              ${brand ? `<p style="margin:8px 0 0;color:#93c5fd;font-size:11px;opacity:0.75;">Powered by Poveon</p>` : ""}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px;border-left:1px solid #e0effe;border-right:1px solid #e0effe;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f0f7ff;border:1px solid #e0effe;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#6b7280;font-size:12px;">
                © ${new Date().getFullYear()} ${brand ? brand.name : "Poveon"}. All rights reserved.<br>
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const codeBox = (code: string) => `
  <div style="background:#f0f7ff;border:2px dashed #0270c3;border-radius:8px;padding:20px;text-align:center;margin:24px 0;">
    <p style="margin:0 0 4px;color:#0259a0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Request Code</p>
    <p style="margin:0;color:#0259a0;font-size:32px;font-weight:800;letter-spacing:4px;font-family:monospace;">${code}</p>
  </div>
`;

const divider = `<hr style="border:none;border-top:1px solid #e0effe;margin:24px 0;">`;

const label = (text: string) =>
  `<span style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${text}</span>`;

const value = (text: string) =>
  `<p style="margin:4px 0 16px;color:#1e3a5f;font-size:15px;font-weight:500;">${text}</p>`;

// =============================================================================
// TEMPLATE: Doctor — Request Submitted Confirmation
// =============================================================================
export function doctorRequestConfirmation({
  doctorName,
  patientName,
  code,
  labName,
  labAddress,
  labPhones,
  tests,
  brand,
}: {
  doctorName: string;
  patientName: string;
  code: string;
  labName: string;
  labAddress: string;
  labPhones: { number: string; label: string }[];
  tests: string;
  brand?: { name: string };
}) {
  const phoneLines = labPhones.length
    ? labPhones.map((p) => `<p style="margin:2px 0;color:#1e3a5f;font-size:15px;font-weight:500;">📞 ${p.label ? `${p.label}: ` : ""}${p.number}</p>`).join("")
    : "";
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Lab Request Submitted</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear Dr. ${doctorName},<br><br>
      Your laboratory request for <strong>${patientName}</strong> has been successfully submitted to <strong>${labName}</strong>.
      Please share the request code below with your patient.
    </p>

    ${codeBox(code)}

    ${divider}

    <h3 style="margin:0 0 16px;color:#0259a0;font-size:16px;font-weight:600;">Request Details</h3>

    ${label("Patient")}
    ${value(patientName)}

    ${label("Tests Requested")}
    ${value(tests)}

    ${label("Laboratory")}
    ${value(labName)}

    ${labAddress ? `${label("Lab Address")}${value(labAddress)}` : ""}
    ${phoneLines ? `${label("Lab Phone")}${phoneLines}<p style="margin:0 0 16px;"></p>` : ""}

    ${divider}

    <p style="margin:0 0 20px;color:#6b7280;font-size:13px;line-height:1.6;">
      The patient should present this code at the laboratory reception. You will receive email notifications when the patient arrives and when tests are completed.
    </p>

    <div style="text-align:center;margin:0 0 8px;">
      <a href="https://poveon.com/doc-login/dashboard" style="display:inline-block;background:#0259a0;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:700;font-size:14px;letter-spacing:0.2px;">
        View My Dashboard
      </a>
    </div>
    <p style="text-align:center;margin:0;color:#9ca3af;font-size:12px;">Track all your referrals and results. <a href="https://poveon.com/doc-login" style="color:#0259a0;text-decoration:none;font-weight:600;">Sign in here</a> if you don't have an account.</p>
  `, brand);
}

// =============================================================================
// TEMPLATE: Patient — Request Code Notification
// =============================================================================
export function patientRequestCode({
  patientName,
  code,
  labName,
  labAddress,
  labPhones,
  testCategories,
  brand,
  requestPageUrl,
  isSelfService = false,
}: {
  patientName: string;
  code: string;
  labName: string;
  labAddress: string;
  labPhones: { number: string; label: string }[];
  testCategories?: string[];
  brand?: { name: string };
  requestPageUrl?: string;
  isSelfService?: boolean;
}) {
  const phoneLines = labPhones.length
    ? labPhones.map((p) => `<p style="margin:2px 0;color:#1e3a5f;font-size:14px;">📞 ${p.label ? `${p.label}: ` : ""}${p.number}</p>`).join("")
    : "";
  const greeting = patientName ? `Dear ${patientName},<br><br>` : "";
  const viewRequestButton = requestPageUrl
    ? `<div style="text-align:center;margin:24px 0 8px;">
        <a href="${requestPageUrl}" style="display:inline-block;background:#0270c3;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.2px;">
          View Request &amp; Lab Details
        </a>
      </div>
      <div style="text-align:center;margin:8px 0 0;">
        <a href="${requestPageUrl.replace(/\/r\/.*/, "/login")}" style="display:inline-block;background:#f0f7ff;color:#0259a0;text-decoration:none;padding:10px 24px;border-radius:10px;font-weight:600;font-size:13px;border:1px solid #bfdbfe;">
          Manage in Patient Portal
        </a>
      </div>`
    : "";
  const testCategoriesSection = testCategories && testCategories.length > 0
    ? `${divider}
      <h3 style="margin:0 0 12px;color:#0259a0;font-size:16px;font-weight:600;">Tests Requested</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${testCategories.map((cat) => `<span style="display:inline-block;background:#f0f7ff;color:#0259a0;border:1px solid #bfdbfe;border-radius:20px;padding:5px 14px;font-size:13px;font-weight:600;">${cat}</span>`).join("")}
      </div>`
    : "";
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Your Lab Test Request</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      ${greeting}${isSelfService
        ? `Your lab test request has been received by <strong>${labName}</strong>.`
        : `Your doctor has sent a laboratory test request on your behalf to <strong>${labName}</strong>.`}
      Please present the code below when you arrive at the laboratory.
    </p>

    ${codeBox(code)}

    ${viewRequestButton}

    ${testCategoriesSection}

    ${divider}

    <h3 style="margin:0 0 12px;color:#0259a0;font-size:16px;font-weight:600;">Where to Go</h3>
    <p style="margin:0 0 8px;color:#4b5563;font-size:14px;font-weight:500;">${labName}</p>
    ${labAddress ? `<p style="margin:0 0 6px;color:#1e3a5f;font-size:14px;">${labAddress}</p>` : ""}
    ${phoneLines}
    ${phoneLines ? `<p style="margin:0 0 16px;"></p>` : ""}

    ${divider}

    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
      Simply walk in and provide this code at the reception desk. No appointment necessary — your test request has already been registered.
    </p>
  `, brand);
}

// =============================================================================
// TEMPLATE: Doctor — Lab Confirmed Order
// =============================================================================
export function doctorPatientArrived({
  doctorName,
  patientName,
  labName,
  code,
  brand,
}: {
  doctorName: string;
  patientName: string;
  labName: string;
  code: string;
  brand?: { name: string };
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0270c3;font-size:20px;font-weight:700;">Order Confirmed by Lab</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear Dr. ${doctorName},<br><br>
      <strong>${labName}</strong> has confirmed the order for your patient <strong>${patientName}</strong>.
    </p>

    ${divider}

    ${label("Patient")}
    ${value(patientName)}

    ${label("Laboratory")}
    ${value(labName)}

    ${label("Request Code")}
    ${value(`<span style="font-family:monospace;font-weight:700;">${code}</span>`)}

    ${divider}

    <p style="margin:0;color:#6b7280;font-size:13px;">
      You will receive another notification when the tests have been completed.
    </p>
  `, brand);
}

// =============================================================================
// TEMPLATE: Doctor — Tests Completed
// =============================================================================
export function doctorTestsCompleted({
  doctorName,
  patientName,
  labName,
  code,
  brand,
}: {
  doctorName: string;
  patientName: string;
  labName: string;
  code: string;
  brand?: { name: string };
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#059669;font-size:20px;font-weight:700;">Tests Completed</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear Dr. ${doctorName},<br><br>
      The laboratory tests for your patient <strong>${patientName}</strong> have been completed at <strong>${labName}</strong>.
    </p>

    ${divider}

    ${label("Patient")}
    ${value(patientName)}

    ${label("Laboratory")}
    ${value(labName)}

    ${label("Request Code")}
    ${value(`<span style="font-family:monospace;font-weight:700;">${code}</span>`)}

    ${divider}

    <p style="margin:0;color:#6b7280;font-size:13px;">
      Please contact the laboratory or your patient directly to arrange result collection.
    </p>
  `, brand);
}

// =============================================================================
// TEMPLATE: Doctor — Lab Results Available
// =============================================================================
export function labResultsDoctor({
  doctorName,
  patientName,
  labName,
  code,
  resultLink,
  hasAttachment,
  note,
  brand,
}: {
  doctorName: string;
  patientName: string;
  labName: string;
  code: string;
  resultLink?: string;
  hasAttachment?: boolean;
  note?: string;
  brand?: { name: string };
}) {
  const resultsSection = [
    resultLink
      ? `<div style="text-align:center;margin:24px 0;">
          <a href="${resultLink}" style="display:inline-block;background:#0270c3;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
            View Results Online
          </a>
        </div>`
      : "",
    hasAttachment
      ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0;color:#166534;font-size:14px;font-weight:500;">📎 Results are attached to this email as PDF document(s).</p>
        </div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const noteSection = note
    ? `${divider}
       <h3 style="margin:0 0 8px;color:#92400e;font-size:14px;font-weight:600;">Note from Laboratory</h3>
       <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">
         <p style="margin:0;color:#78350f;font-size:14px;line-height:1.6;">${note}</p>
       </div>`
    : "";

  return base(`
    <h2 style="margin:0 0 8px;color:#059669;font-size:20px;font-weight:700;">Lab Results Available</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear Dr. ${doctorName},<br><br>
      The laboratory results for your patient <strong>${patientName}</strong> are now available from <strong>${labName}</strong>.
    </p>

    ${divider}

    ${label("Patient")}
    ${value(patientName)}

    ${label("Laboratory")}
    ${value(labName)}

    ${label("Request Code")}
    ${value(`<span style="font-family:monospace;font-weight:700;">${code}</span>`)}

    ${divider}

    <h3 style="margin:0 0 12px;color:#059669;font-size:16px;font-weight:600;">Results</h3>

    ${resultsSection}

    ${noteSection}

    ${divider}

    <p style="margin:0;color:#6b7280;font-size:13px;">
      Thank you for using ${brand ? brand.name : "Poveon"}.
    </p>
  `, brand);
}

// =============================================================================
// TEMPLATE: Patient — Lab Results Available
// =============================================================================
export function labResultsPatient({
  patientName,
  labName,
  resultLink,
  hasAttachment,
  brand,
}: {
  patientName: string;
  labName: string;
  resultLink?: string;
  hasAttachment?: boolean;
  brand?: { name: string };
}) {
  const resultsSection = [
    resultLink
      ? `<div style="text-align:center;margin:24px 0;">
          <a href="${resultLink}" style="display:inline-block;background:#0270c3;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
            View Your Results Online
          </a>
        </div>`
      : "",
    hasAttachment
      ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0;color:#166534;font-size:14px;font-weight:500;">📎 Your results are attached to this email as a PDF document.</p>
        </div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return base(`
    <h2 style="margin:0 0 8px;color:#059669;font-size:20px;font-weight:700;">Your Lab Results Are Ready</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear ${patientName},<br><br>
      Your laboratory test results from <strong>${labName}</strong> are now available.
      Please share these results with your doctor if you have not already done so.
    </p>

    ${divider}

    <h3 style="margin:0 0 12px;color:#059669;font-size:16px;font-weight:600;">Results</h3>

    ${resultsSection}

    ${divider}

    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
      If you have any questions about your results, please contact your doctor or ${brand ? brand.name : "the laboratory"} directly.
    </p>
  `, brand);
}

// =============================================================================
// TEMPLATE: Lab — Account Created (Credentials Email)
// =============================================================================
export function labAccountCreated({
  labName,
  email,
  tempPassword,
  loginUrl,
}: {
  labName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Welcome to Poveon</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Your laboratory has been registered on the Poveon platform.
      Use the credentials below to access your dashboard.
    </p>

    ${divider}

    ${label("Laboratory Name")}
    ${value(labName)}

    ${label("Login Email")}
    ${value(email)}

    ${label("Temporary Password")}
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:12px;margin:4px 0 16px;">
      <p style="margin:0;color:#c2410c;font-size:18px;font-weight:700;font-family:monospace;">${tempPassword}</p>
    </div>

    ${divider}

    <div style="text-align:center;margin:24px 0;">
      <a href="${loginUrl}" style="display:inline-block;background:#0270c3;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
        Log In to Dashboard
      </a>
    </div>

    <p style="margin:16px 0 0;color:#dc2626;font-size:13px;font-weight:500;">
      ⚠️ For security, please change your password immediately after your first login via the dashboard settings.
    </p>
  `);
}

export function labMemberWelcome({
  labName,
  roleName,
  email,
  tempPassword,
  loginUrl,
}: {
  labName: string;
  roleName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">You've been added to ${labName}</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      An account has been created for you on the Poveon lab portal.
      Use the credentials below to sign in.
    </p>

    ${divider}

    ${label("Laboratory")}
    ${value(labName)}

    ${label("Your Role")}
    ${value(roleName)}

    ${label("Login Email")}
    ${value(email)}

    ${label("Temporary Password")}
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:12px;margin:4px 0 16px;">
      <p style="margin:0;color:#c2410c;font-size:18px;font-weight:700;font-family:monospace;">${tempPassword}</p>
    </div>

    ${divider}

    <div style="text-align:center;margin:24px 0;">
      <a href="${loginUrl}" style="display:inline-block;background:#0270c3;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
        Sign In to Dashboard
      </a>
    </div>

    <p style="margin:16px 0 0;color:#dc2626;font-size:13px;font-weight:500;">
      ⚠️ Please change your password after your first login.
    </p>
  `, { name: labName });
}

// =============================================================================
// TEMPLATE: Doctor — One-Time Passcode for Portal Login
// =============================================================================
// =============================================================================
// TEMPLATE: Marketer — One-Time Passcode for Portal Login
// =============================================================================
export function marketerOtpEmail({
  marketerName,
  marketerEmail,
  otp,
}: {
  marketerName: string;
  marketerEmail: string;
  otp: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Your Login Code</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Hi ${marketerName},<br><br>
      Use the code below to sign in to your Poveon marketer dashboard. It expires in <strong>10 minutes</strong>.
    </p>

    <div style="background:#f0f7ff;border:2px dashed #0270c3;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
      <p style="margin:0 0 6px;color:#0259a0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">One-Time Passcode</p>
      <p style="margin:0;color:#0259a0;font-size:40px;font-weight:800;letter-spacing:10px;font-family:monospace;">${otp}</p>
    </div>

    ${divider}

    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Signing in as: <strong style="color:#1e3a5f;">${marketerEmail}</strong></p>

    <p style="margin:12px 0 0;color:#dc2626;font-size:13px;font-weight:500;">
      If you did not request this code, you can safely ignore this email.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Doctor — One-Time Passcode for Portal Login
// =============================================================================
export function doctorOtpEmail({
  doctorEmail,
  otp,
}: {
  doctorEmail: string;
  otp: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Your Login Code</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Use the code below to sign in to your Poveon doctor portal. It expires in <strong>10 minutes</strong>.
    </p>

    <div style="background:#f0f7ff;border:2px dashed #0270c3;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
      <p style="margin:0 0 6px;color:#0259a0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">One-Time Passcode</p>
      <p style="margin:0;color:#0259a0;font-size:40px;font-weight:800;letter-spacing:10px;font-family:monospace;">${otp}</p>
    </div>

    ${divider}

    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Signing in as: <strong style="color:#1e3a5f;">${doctorEmail}</strong></p>

    <p style="margin:12px 0 0;color:#dc2626;font-size:13px;font-weight:500;">
      If you did not request this code, you can safely ignore this email.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Patient — One-Time Passcode for Portal Login
// =============================================================================
export function patientOtpEmail({
  patientEmail,
  otp,
}: {
  patientEmail: string;
  otp: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Your Login Code</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Use the code below to sign in to your Poveon Patient Portal. It expires in <strong>10 minutes</strong>.
    </p>

    <div style="background:#f0f7ff;border:2px dashed #0270c3;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
      <p style="margin:0 0 6px;color:#0259a0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">One-Time Passcode</p>
      <p style="margin:0;color:#0259a0;font-size:40px;font-weight:800;letter-spacing:10px;font-family:monospace;">${otp}</p>
    </div>

    ${divider}

    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Signing in as: <strong style="color:#1e3a5f;">${patientEmail}</strong></p>

    <p style="margin:12px 0 0;color:#dc2626;font-size:13px;font-weight:500;">
      If you did not request this code, you can safely ignore this email.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Lab — One-Time Passcode (password reset / verification)
// =============================================================================
export function labOtpEmail({
  email,
  otp,
  purpose,
}: {
  email: string;
  otp: string;
  purpose: "reset" | "verify";
}) {
  const title = purpose === "reset" ? "Password Reset Code" : "Verification Code";
  const desc = purpose === "reset"
    ? "Use the code below to reset your lab dashboard password. It expires in <strong>10 minutes</strong>."
    : "Use the code below to verify your identity before changing your password. It expires in <strong>10 minutes</strong>.";
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">${title}</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">${desc}</p>

    <div style="background:#f0f7ff;border:2px dashed #0270c3;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
      <p style="margin:0 0 6px;color:#0259a0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">One-Time Code</p>
      <p style="margin:0;color:#0259a0;font-size:40px;font-weight:800;letter-spacing:10px;font-family:monospace;">${otp}</p>
    </div>

    ${divider}

    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Account: <strong style="color:#1e3a5f;">${email}</strong></p>
    <p style="margin:12px 0 0;color:#dc2626;font-size:13px;font-weight:500;">
      If you did not request this code, please secure your account immediately.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Lab — New Request Notification
// =============================================================================
export function labNewRequest({
  labName,
  patientName,
  patientPhone,
  doctorName,
  doctorPhone,
  doctorHospital,
  tests,
  diagnosis,
  schedule,
  isUrgent,
  isCritical,
  needsAmbulance,
  ambulanceNotes,
  testImageUrl,
  appUrl,
  code,
}: {
  labName: string;
  patientName: string;
  patientPhone?: string;
  doctorName: string;
  doctorPhone?: string;
  doctorHospital?: string;
  tests: string;
  diagnosis?: string;
  schedule?: string;
  isUrgent: boolean;
  isCritical: boolean;
  needsAmbulance: boolean;
  ambulanceNotes?: string;
  testImageUrl?: string;
  appUrl: string;
  code: string;
}) {
  const urgentBanner = isUrgent
    ? `<div style="background:#fee2e2;border:2px solid #ef4444;border-radius:8px;padding:14px 20px;margin:0 0 24px;text-align:center;">
        <p style="margin:0;color:#b91c1c;font-size:15px;font-weight:700;letter-spacing:0.5px;">
          🚨 URGENT REQUEST${needsAmbulance ? " — AMBULANCE REQUIRED" : ""}${isCritical ? " — CRITICAL PATIENT" : ""}
        </p>
      </div>`
    : "";

  const scheduleLabel: Record<string, string> = {
    today: "Today",
    this_week: "This Week",
    this_month: "This Month",
    not_sure: "Not Sure",
  };

  const imageSection = testImageUrl
    ? `${label("Test Image / Referral Document")}
       <div style="margin:8px 0 16px;">
         <a href="${testImageUrl}" style="display:inline-block;background:#0270c3;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:13px;">📎 View Test Request Image</a>
       </div>`
    : "";

  const ambulanceSection = needsAmbulance
    ? `${label("Ambulance Required")}
       ${value("Yes")}
       ${ambulanceNotes ? `${label("Ambulance Notes")}${value(ambulanceNotes)}` : ""}`
    : "";

  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">New Lab Request Received</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      ${labName} has received a new laboratory request. Complete details are provided below.
    </p>

    ${urgentBanner}

    ${code ? `${codeBox(code)}` : ""}

    <h3 style="margin:0 0 16px;color:#0259a0;font-size:16px;font-weight:600;">Patient Information</h3>
    ${patientName ? `${label("Patient Name")}${value(patientName)}` : ""}
    ${patientPhone ? `${label("Patient Phone")}${value(patientPhone)}` : ""}
    ${divider}

    <h3 style="margin:0 0 16px;color:#0259a0;font-size:16px;font-weight:600;">Referring Doctor</h3>
    ${doctorName ? `${label("Doctor Name")}${value(doctorName)}` : ""}
    ${doctorPhone ? `${label("Doctor Phone")}${value(doctorPhone)}` : ""}
    ${doctorHospital ? `${label("Hospital / Clinic")}${value(doctorHospital)}` : ""}
    ${divider}

    <h3 style="margin:0 0 16px;color:#0259a0;font-size:16px;font-weight:600;">Tests Requested</h3>
    ${label("Test Details")}
    ${value(tests)}
    ${divider}

    <h3 style="margin:0 0 16px;color:#0259a0;font-size:16px;font-weight:600;">Request Details</h3>

    ${diagnosis ? `${label("Diagnosis / Clinical Notes")}${value(diagnosis)}` : ""}
    ${schedule ? `${label("Preferred Schedule")}${value(scheduleLabel[schedule] ?? schedule)}` : ""}
    ${isCritical ? `${label("Critical Patient")}${value("Yes")}` : ""}
    ${ambulanceSection}
    ${imageSection}

    ${divider}

    ${appUrl ? `<div style="text-align:center;margin:8px 0 4px;">
      <a href="${appUrl}/lab-dashboard" style="display:inline-block;background:#0259a0;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:700;font-size:14px;letter-spacing:0.2px;">
        View in Dashboard
      </a>
    </div>
    <p style="text-align:center;margin:0;color:#9ca3af;font-size:12px;">Manage this request in your Poveon dashboard.</p>` : ""}
  `, { name: labName });
}

// =============================================================================
// Agreement Invite Email
// =============================================================================

export function agreementInviteEmail({
  labName,
  signingUrl,
  expiresAt,
}: {
  labName: string;
  signingUrl: string;
  expiresAt: string;
}): string {
  return base(`
    <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Action Required</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;">Sign your Poveon Partnership Agreement</p>

    <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">
      Dear ${labName} team,
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">
      To complete your onboarding on the Poveon platform, please review and digitally sign
      the <strong>Laboratory Partnership Agreement</strong>. This agreement sets out the terms under
      which your laboratory will receive patient referrals and operate on our platform.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#334155;line-height:1.6;">
      The signing process takes approximately <strong>5 minutes</strong> and requires:
    </p>
    <ul style="margin:0 0 24px;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">
      <li>Reading the full agreement</li>
      <li>Providing your full name and title</li>
      <li>Applying your digital signature</li>
    </ul>

    <div style="text-align:center;margin:32px 0;">
      <a href="${signingUrl}"
         style="display:inline-block;background:#0259a0;color:#ffffff;text-decoration:none;
                padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.2px;">
        Review &amp; Sign Agreement →
      </a>
    </div>

    <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;text-align:center;">
      This link expires on ${expiresAt}. Do not share it with others.
    </p>
    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
      If the button above doesn't work, copy and paste this link into your browser:<br/>
      <a href="${signingUrl}" style="color:#0259a0;word-break:break-all;">${signingUrl}</a>
    </p>
  `);
}

// =============================================================================
// Agreement Signed Confirmation Email
// =============================================================================

export function agreementSignedConfirmationEmail({
  signerName,
  labName,
  refNo,
  signedAt,
  downloadUrl,
}: {
  signerName: string;
  labName: string;
  refNo: string;
  signedAt: string;
  downloadUrl: string;
}): string {
  return base(`
    <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Agreement Signed ✓</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;">Your Poveon Partnership Agreement is now active</p>

    <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">
      Dear ${signerName},
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">
      Thank you. The Poveon Laboratory Partnership Agreement for <strong>${labName}</strong>
      has been successfully signed and is now legally binding.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                  padding:20px;margin:24px 0;">
      <tr>
        <td style="font-size:11px;color:#94a3b8;text-transform:uppercase;
                   letter-spacing:0.8px;padding-bottom:14px;font-weight:700;">
          Agreement Details
        </td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#475569;padding:4px 0;">
          <strong style="color:#0f172a;">Reference:</strong>&nbsp; ${refNo}
        </td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#475569;padding:4px 0;">
          <strong style="color:#0f172a;">Signed by:</strong>&nbsp; ${signerName}
        </td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#475569;padding:4px 0;">
          <strong style="color:#0f172a;">Laboratory:</strong>&nbsp; ${labName}
        </td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#475569;padding:4px 0;">
          <strong style="color:#0f172a;">Date &amp; Time:</strong>&nbsp; ${signedAt}
        </td>
      </tr>
    </table>

    ${downloadUrl ? `
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="${downloadUrl}"
         style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;
                padding:13px 32px;border-radius:8px;font-weight:600;font-size:14px;">
        Download Signed Agreement (PDF)
      </a>
    </div>
    <p style="margin:0 0 24px;font-size:11px;color:#94a3b8;text-align:center;">
      Download link valid for 7 days
    </p>
    ` : ""}

    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
      Please retain a copy of this agreement for your records. A copy has also been stored
      securely on the Poveon platform and is accessible to Poveon administrators.
      If you have any questions, contact us at <a href="mailto:legal@poveonhealth.com"
      style="color:#0259a0;">legal@poveonhealth.com</a>.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Hospital — One-Time Passcode for Portal Login
// =============================================================================
export function hospitalOtpEmail({
  email,
  otp,
}: {
  email: string;
  otp: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Your Login Code</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Use the code below to sign in to your Poveon hospital portal. It expires in <strong>10 minutes</strong>.
    </p>

    <div style="background:#f0f7ff;border:2px dashed #0270c3;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
      <p style="margin:0 0 6px;color:#0259a0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">One-Time Passcode</p>
      <p style="margin:0;color:#0259a0;font-size:40px;font-weight:800;letter-spacing:10px;font-family:monospace;">${otp}</p>
    </div>

    ${divider}

    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Signing in as: <strong style="color:#1e3a5f;">${email}</strong></p>

    <p style="margin:12px 0 0;color:#dc2626;font-size:13px;font-weight:500;">
      If you did not request this code, you can safely ignore this email.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Hospital — Account Created by Admin
// =============================================================================
export function hospitalAccountCreated({
  hospitalName,
  email,
  loginUrl,
}: {
  hospitalName: string;
  email: string;
  loginUrl: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Welcome to Poveon Referrals</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      <strong>${hospitalName}</strong> has been registered on the Poveon patient referral network.
      You can now receive patient referrals from doctors, manage your registered doctors,
      and respond to referrals from your hospital dashboard.
    </p>

    ${label("Login Email")}
    ${value(email)}

    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      To sign in for the first time, request a one-time code with the email above and set your 4-digit PIN.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#0259a0,#0270c3);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;">
        Open Hospital Portal
      </a>
    </div>

    ${divider}

    <p style="margin:0;color:#6b7280;font-size:13px;">
      New patient referrals will also be sent to this email address so you never miss one.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Hospital — New Patient Referral Received
// =============================================================================
export function hospitalNewReferral({
  hospitalName,
  code,
  patientName,
  patientAge,
  patientSex,
  specialty,
  urgency,
  doctorName,
  fromHospital,
  dashboardUrl,
  redirectedFrom,
}: {
  hospitalName: string;
  code: string;
  patientName: string;
  patientAge?: number | null;
  patientSex?: string | null;
  specialty: string;
  urgency: string;
  doctorName: string;
  fromHospital: string;
  dashboardUrl: string;
  redirectedFrom?: string;
}) {
  const urgencyBadge =
    urgency === "emergency"
      ? `<span style="display:inline-block;background:#fee2e2;color:#dc2626;font-size:12px;font-weight:700;padding:4px 12px;border-radius:99px;text-transform:uppercase;letter-spacing:0.5px;">🚨 Emergency</span>`
      : urgency === "urgent"
      ? `<span style="display:inline-block;background:#fef3c7;color:#b45309;font-size:12px;font-weight:700;padding:4px 12px;border-radius:99px;text-transform:uppercase;letter-spacing:0.5px;">⚠️ Urgent</span>`
      : "";
  const demographics = [patientAge ? `${patientAge} yrs` : null, patientSex || null].filter(Boolean).join(", ");
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">
      ${redirectedFrom ? "Referral Redirected to You" : "New Patient Referral"}
    </h2>
    ${urgencyBadge ? `<p style="margin:0 0 16px;">${urgencyBadge}</p>` : ""}
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear ${hospitalName},<br><br>
      ${redirectedFrom
        ? `<strong>${redirectedFrom}</strong> has redirected a patient referral to your hospital.`
        : `<strong>${doctorName}</strong> has referred a patient to your hospital.`}
      Please review and respond from your dashboard.
    </p>

    ${codeBox(code)}

    ${divider}

    ${label("Patient")}
    ${value(`${patientName}${demographics ? ` (${demographics})` : ""}`)}

    ${label("Specialty Requested")}
    ${value(specialty)}

    ${label("Referring Doctor")}
    ${value(doctorName)}

    ${label("Referring From")}
    ${value(fromHospital)}

    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,#0259a0,#0270c3);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;">
        Review Referral
      </a>
    </div>

    <p style="margin:16px 0 0;color:#6b7280;font-size:13px;text-align:center;">
      The full referral note and patient contact details are available on your dashboard.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Doctor — Referral Sent Confirmation
// =============================================================================
export function referralDoctorConfirmation({
  doctorName,
  patientName,
  hospitalName,
  code,
  specialty,
  trackUrl,
}: {
  doctorName: string;
  patientName: string;
  hospitalName: string;
  code: string;
  specialty: string;
  trackUrl: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Referral Sent</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear ${doctorName},<br><br>
      Your referral for <strong>${patientName}</strong> has been sent to <strong>${hospitalName}</strong>
      (${specialty}). You will be notified when the hospital responds.
    </p>

    ${codeBox(code)}

    <p style="margin:0 0 8px;color:#4b5563;font-size:14px;">
      Use this code to track the referral at any time:
    </p>
    <p style="margin:0 0 16px;"><a href="${trackUrl}" style="color:#0259a0;font-size:14px;font-weight:600;">${trackUrl}</a></p>
  `);
}

// =============================================================================
// TEMPLATE: Patient — Referral Notice
// =============================================================================
export function referralPatientNotice({
  patientName,
  doctorName,
  hospitalName,
  code,
  specialty,
  trackUrl,
}: {
  patientName: string;
  doctorName: string;
  hospitalName: string;
  code: string;
  specialty: string;
  trackUrl: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">You Have Been Referred</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear ${patientName},<br><br>
      <strong>${doctorName}</strong> has referred you to <strong>${hospitalName}</strong> (${specialty}).
      The hospital will review the referral, and you will be notified once they respond.
      Keep the referral code below — you may be asked for it at the hospital.
    </p>

    ${codeBox(code)}

    <p style="margin:0 0 8px;color:#4b5563;font-size:14px;">
      Track the status of your referral here:
    </p>
    <p style="margin:0 0 16px;"><a href="${trackUrl}" style="color:#0259a0;font-size:14px;font-weight:600;">${trackUrl}</a></p>
  `);
}

// =============================================================================
// TEMPLATE: Doctor / Patient — Referral Status Update
// =============================================================================
export function referralStatusUpdate({
  recipientName,
  status,
  code,
  patientName,
  hospitalName,
  newHospitalName,
  responseNote,
  trackUrl,
  isPatient,
}: {
  recipientName: string;
  status: "accepted" | "rejected" | "redirected";
  code: string;
  patientName: string;
  hospitalName: string;
  newHospitalName?: string;
  responseNote?: string | null;
  trackUrl: string;
  isPatient: boolean;
}) {
  const subject =
    status === "accepted"
      ? { title: "Referral Accepted ✅", color: "#16a34a" }
      : status === "rejected"
      ? { title: "Referral Not Accepted", color: "#dc2626" }
      : { title: "Referral Redirected", color: "#b45309" };

  const who = isPatient ? "Your referral" : `The referral for <strong>${patientName}</strong>`;
  const bodyLine =
    status === "accepted"
      ? `${who} has been <strong style="color:#16a34a;">accepted</strong> by <strong>${hospitalName}</strong>.${isPatient ? " You may now proceed to the hospital with your referral code." : ""}`
      : status === "rejected"
      ? `${who} was <strong style="color:#dc2626;">not accepted</strong> by <strong>${hospitalName}</strong>.${isPatient ? " Please contact your doctor for the next steps." : " You may refer the patient to another hospital."}`
      : `${who} has been <strong style="color:#b45309;">redirected</strong> by <strong>${hospitalName}</strong> to <strong>${newHospitalName ?? "another hospital"}</strong>, which will now review it.`;

  return base(`
    <h2 style="margin:0 0 8px;color:${subject.color};font-size:20px;font-weight:700;">${subject.title}</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear ${recipientName},<br><br>
      ${bodyLine}
    </p>

    ${codeBox(code)}

    ${responseNote ? `
      ${label("Note from the hospital")}
      ${value(responseNote)}
    ` : ""}

    <p style="margin:0 0 8px;color:#4b5563;font-size:14px;">
      Track this referral at any time:
    </p>
    <p style="margin:0 0 16px;"><a href="${trackUrl}" style="color:#0259a0;font-size:14px;font-weight:600;">${trackUrl}</a></p>
  `);
}

// =============================================================================
// TEMPLATE: Patient — Dermatology Consult Received
// =============================================================================
export function skinConsultPatient({
  patientName,
  code,
  trackNote,
}: {
  patientName: string;
  code: string;
  trackNote?: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Your Skin Consultation Was Received</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear ${patientName},<br><br>
      Thank you — your dermatology consultation has been received. One of our dermatologists
      will review your photos and answers, and reach out to you on WhatsApp to follow up.
      Please keep your phone handy.
    </p>

    ${codeBox(code)}

    <p style="margin:0 0 8px;color:#4b5563;font-size:14px;">
      Keep this reference code for your records. ${trackNote ?? ""}
    </p>

    ${divider}

    <p style="margin:12px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
      <strong>Please note:</strong> this service connects you with a dermatologist for guidance.
      It is not a substitute for emergency care. If your condition is rapidly worsening,
      you have a high fever, difficulty breathing, or widespread blistering, please seek
      urgent in-person medical attention.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Admin — New Dermatology Consult Submitted
// =============================================================================
export function skinConsultAdmin({
  code,
  patientName,
  patientEmail,
  patientWhatsapp,
  patientAge,
  patientSex,
  imageUrls,
  conversation,
  aiSummary,
  dashboardUrl,
}: {
  code: string;
  patientName: string;
  patientEmail: string;
  patientWhatsapp: string;
  patientAge?: number | null;
  patientSex?: string | null;
  imageUrls: string[];
  conversation: { role: string; content: string }[];
  aiSummary?: string | null;
  dashboardUrl: string;
}) {
  const demographics = [patientAge ? `${patientAge} yrs` : null, patientSex || null].filter(Boolean).join(", ");

  const imagesHtml = imageUrls.length
    ? `<div style="margin:8px 0 0;">${imageUrls
        .map(
          (url, i) =>
            `<a href="${url}" style="display:inline-block;margin:0 8px 8px 0;"><img src="${url}" alt="Photo ${i + 1}" width="120" style="width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid #e0effe;" /></a>`
        )
        .join("")}</div>`
    : `<p style="margin:0;color:#9ca3af;font-size:13px;">No photos uploaded.</p>`;

  const chatHtml = conversation.length
    ? conversation
        .map((m) => {
          const isPatient = m.role === "user";
          return `<div style="margin:0 0 10px;">
            <p style="margin:0 0 2px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${isPatient ? "#0259a0" : "#6b7280"};">${isPatient ? "Patient" : "Assistant"}</p>
            <p style="margin:0;padding:10px 14px;border-radius:10px;background:${isPatient ? "#f0f7ff" : "#f8fafc"};color:#1e3a5f;font-size:14px;line-height:1.5;white-space:pre-wrap;">${m.content}</p>
          </div>`;
        })
        .join("")
    : `<p style="margin:0;color:#9ca3af;font-size:13px;">No chat recorded.</p>`;

  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">New Dermatology Consultation</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:15px;">
      A new async skin consultation has been submitted and is awaiting dermatologist review.
    </p>

    ${codeBox(code)}

    ${divider}

    <h3 style="margin:0 0 12px;color:#0259a0;font-size:15px;font-weight:700;">Patient</h3>
    ${label("Name")}
    ${value(`${patientName}${demographics ? ` (${demographics})` : ""}`)}
    ${label("Email")}
    ${value(`<a href="mailto:${patientEmail}" style="color:#0259a0;">${patientEmail}</a>`)}
    ${label("WhatsApp")}
    ${value(`<a href="https://wa.me/${patientWhatsapp.replace(/[^0-9]/g, "")}" style="color:#16a34a;font-weight:700;">${patientWhatsapp}</a>`)}

    ${divider}

    <h3 style="margin:0 0 8px;color:#0259a0;font-size:15px;font-weight:700;">Photos</h3>
    ${imagesHtml}

    ${aiSummary ? `
      ${divider}
      <h3 style="margin:0 0 8px;color:#0259a0;font-size:15px;font-weight:700;">AI Intake Summary</h3>
      <p style="margin:0;padding:12px 16px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:14px;line-height:1.6;white-space:pre-wrap;">${aiSummary}</p>
    ` : ""}

    ${divider}

    <h3 style="margin:0 0 12px;color:#0259a0;font-size:15px;font-weight:700;">Full Conversation</h3>
    ${chatHtml}

    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,#0259a0,#0270c3);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;">
        Open in Admin Dashboard
      </a>
    </div>
  `);
}

// =============================================================================
// TEMPLATE: Patient — Encounter request received (doctor per-encounter charging)
// =============================================================================
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export function encounterPatientEmail({
  patientName,
  doctorName,
  code,
  planLabel,
  amount,
}: {
  patientName: string;
  doctorName: string;
  code: string;
  planLabel: string;
  amount: number;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Your Request Was Received</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear ${patientName},<br><br>
      Thank you — your request to <strong>${doctorName}</strong> has been received and your payment confirmed.
      ${doctorName} will review your answers${planLabel.includes("retainer") ? " and your retainership is now active" : ""} and follow up with you shortly.
    </p>

    ${codeBox(code)}

    ${label("Plan")}
    ${value(planLabel)}
    ${label("Amount paid")}
    ${value(naira(amount))}

    ${divider}

    <p style="margin:12px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
      <strong>Please note:</strong> this service connects you with your doctor for guidance. It is not a
      substitute for emergency care. If your condition is rapidly worsening or this is an emergency,
      please seek urgent in-person medical attention.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Doctor — New paid encounter (questions, answers, photos)
// =============================================================================
export function encounterDoctorEmail({
  code,
  patientName,
  patientEmail,
  patientPhone,
  patientAge,
  patientSex,
  planLabel,
  amount,
  doctorShare,
  imageUrls,
  conversation,
  aiSummary,
  dashboardUrl,
}: {
  code: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  patientAge?: number | null;
  patientSex?: string | null;
  planLabel: string;
  amount: number;
  doctorShare: number;
  imageUrls: string[];
  conversation: { role: string; content: string }[];
  aiSummary?: string | null;
  dashboardUrl: string;
}) {
  const demographics = [patientAge ? `${patientAge} yrs` : null, patientSex || null].filter(Boolean).join(", ");

  const imagesHtml = imageUrls.length
    ? `<div style="margin:8px 0 0;">${imageUrls
        .map(
          (url, i) =>
            `<a href="${url}" style="display:inline-block;margin:0 8px 8px 0;"><img src="${url}" alt="Photo ${i + 1}" width="120" style="width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid #e0effe;" /></a>`
        )
        .join("")}</div>`
    : `<p style="margin:0;color:#9ca3af;font-size:13px;">No photos uploaded.</p>`;

  const chatHtml = conversation.length
    ? conversation
        .map((m) => {
          const isPatient = m.role === "user";
          return `<div style="margin:0 0 10px;">
            <p style="margin:0 0 2px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${isPatient ? "#0259a0" : "#6b7280"};">${isPatient ? "Patient" : "Assistant"}</p>
            <p style="margin:0;padding:10px 14px;border-radius:10px;background:${isPatient ? "#f0f7ff" : "#f8fafc"};color:#1e3a5f;font-size:14px;line-height:1.5;white-space:pre-wrap;">${m.content}</p>
          </div>`;
        })
        .join("")
    : `<p style="margin:0;color:#9ca3af;font-size:13px;">No chat recorded.</p>`;

  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">New Patient Encounter</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:15px;">
      A patient has submitted a paid encounter through your Poveon link.
    </p>

    ${codeBox(code)}

    <div style="display:flex;gap:12px;margin:0 0 8px;">
      <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 16px;">
        <p style="margin:0;color:#15803d;font-size:11px;font-weight:700;text-transform:uppercase;">You earn (80%)</p>
        <p style="margin:4px 0 0;color:#166534;font-size:20px;font-weight:800;">${naira(doctorShare)}</p>
      </div>
      <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;">
        <p style="margin:0;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;">${planLabel}</p>
        <p style="margin:4px 0 0;color:#334155;font-size:20px;font-weight:800;">${naira(amount)}</p>
      </div>
    </div>

    ${divider}

    <h3 style="margin:0 0 12px;color:#0259a0;font-size:15px;font-weight:700;">Patient</h3>
    ${label("Name")}
    ${value(`${patientName}${demographics ? ` (${demographics})` : ""}`)}
    ${label("Email")}
    ${value(`<a href="mailto:${patientEmail}" style="color:#0259a0;">${patientEmail}</a>`)}
    ${label("Phone")}
    ${value(`<a href="tel:${patientPhone.replace(/[^0-9+]/g, "")}" style="color:#0259a0;">${patientPhone}</a>`)}

    <h3 style="margin:16px 0 8px;color:#0259a0;font-size:15px;font-weight:700;">Photos</h3>
    ${imagesHtml}

    ${aiSummary ? `
      ${divider}
      <h3 style="margin:0 0 8px;color:#0259a0;font-size:15px;font-weight:700;">AI Intake Summary</h3>
      <p style="margin:0;padding:12px 16px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:14px;line-height:1.6;white-space:pre-wrap;">${aiSummary}</p>
    ` : ""}

    ${divider}

    <h3 style="margin:0 0 12px;color:#0259a0;font-size:15px;font-weight:700;">Questions &amp; Answers</h3>
    ${chatHtml}

    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,#0259a0,#0270c3);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;">
        Open in your dashboard
      </a>
    </div>
  `);
}

// =============================================================================
// TEMPLATE: Patient — Note from the doctor
// =============================================================================
export function encounterNoteEmail({
  patientName,
  doctorName,
  code,
  note,
}: {
  patientName: string;
  doctorName: string;
  code: string;
  note: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">A Note From ${doctorName}</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:15px;">
      Dear ${patientName}, ${doctorName} has sent you a note regarding your encounter <strong>${code}</strong>:
    </p>

    <div style="margin:0 0 20px;padding:16px 20px;border-radius:10px;background:#f0f7ff;border-left:4px solid #0270c3;color:#1e3a5f;font-size:15px;line-height:1.65;white-space:pre-wrap;">${note}</div>

    <p style="margin:12px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
      If you need to follow up, simply reply to this email. This is general guidance and not a substitute
      for emergency care.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Generic branded broadcast (admin bulk email)
// bodyHtml is trusted HTML (composed by an admin) wrapped in the Poveon shell.
// =============================================================================
export function broadcastEmail({ bodyHtml }: { bodyHtml: string }) {
  return base(`
    <div style="color:#1e3a5f;font-size:15px;line-height:1.7;">
      ${bodyHtml}
    </div>
  `);
}

// =============================================================================
// TEMPLATE: Support — dashboard help / feedback message
// =============================================================================
export function supportFeedbackEmail({
  role, senderEmail, senderName, category, message,
}: {
  role: string;
  senderEmail: string | null;
  senderName: string | null;
  category: string;
  message: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">New ${category} message</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:15px;">A ${role} sent a message from their Poveon dashboard.</p>
    ${label("From")}
    ${value(`${senderName ? `${senderName} · ` : ""}${senderEmail ? `<a href="mailto:${senderEmail}" style="color:#0259a0;">${senderEmail}</a>` : "unknown"} <span style="color:#9ca3af;">(${role})</span>`)}
    ${label("Type")}
    ${value(category)}
    ${divider}
    ${label("Message")}
    <p style="margin:4px 0 0;padding:14px 16px;border-radius:10px;background:#f0f7ff;color:#1e3a5f;font-size:15px;line-height:1.6;white-space:pre-wrap;">${message}</p>
  `);
}

// =============================================================================
// TEMPLATE: Doctor — Payout settled
// =============================================================================
export function doctorPayoutEmail({
  doctorName, amount, bankName,
}: {
  doctorName: string;
  amount: number;
  bankName: string | null;
}) {
  const naira = `₦${Math.round(amount).toLocaleString("en-NG")}`;
  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">You've been paid</h2>
    <p style="margin:0 0 20px;color:#4b5563;font-size:15px;">
      Hi ${doctorName || "there"}, a payout from your Poveon earnings has been settled${bankName ? ` to your ${bankName} account` : " to your bank"}.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;text-align:center;margin:0 0 20px;">
      <p style="margin:0;color:#15803d;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Amount settled</p>
      <p style="margin:6px 0 0;color:#166534;font-size:28px;font-weight:800;">${naira}</p>
    </div>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
      You can track all your payouts in your dashboard under Earn → Payouts.
    </p>
  `);
}
