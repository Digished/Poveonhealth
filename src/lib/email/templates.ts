// =============================================================================
// POVEON HEALTH - EMAIL HTML TEMPLATES
// All styles are inline for email client compatibility
// =============================================================================

const base = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Poveon Health</title>
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
                Poveon Health
              </h1>
              <p style="margin:4px 0 0;color:#bae0fd;font-size:13px;">Laboratory Request Management</p>
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
                © ${new Date().getFullYear()} Poveon Health. All rights reserved.<br>
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
  labAddresses,
  tests,
}: {
  doctorName: string;
  patientName: string;
  code: string;
  labName: string;
  labAddresses: string[];
  tests: string;
}) {
  const addressList = labAddresses
    .map(
      (a) =>
        `<li style="margin:4px 0;color:#1e3a5f;font-size:14px;">${a}</li>`
    )
    .join("");

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

    ${label("Lab Addresses")}
    <ul style="margin:4px 0 16px;padding-left:20px;">
      ${addressList}
    </ul>

    ${divider}

    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
      The patient should present this code at the laboratory reception. You will receive email notifications when the patient arrives and when tests are completed.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Patient — Request Code Notification
// =============================================================================
export function patientRequestCode({
  patientName,
  code,
  labName,
  labAddresses,
  doctorName,
}: {
  patientName: string;
  code: string;
  labName: string;
  labAddresses: string[];
  doctorName: string;
}) {
  const addressList = labAddresses
    .map(
      (a) =>
        `<li style="margin:4px 0;color:#1e3a5f;font-size:14px;">${a}</li>`
    )
    .join("");

  return base(`
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Your Lab Test Request</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear ${patientName},<br><br>
      Dr. ${doctorName} has sent a laboratory test request on your behalf to <strong>${labName}</strong>.
      Please present the code below when you arrive at the laboratory.
    </p>

    ${codeBox(code)}

    ${divider}

    <h3 style="margin:0 0 12px;color:#0259a0;font-size:16px;font-weight:600;">Where to Go</h3>
    <p style="margin:0 0 8px;color:#4b5563;font-size:14px;font-weight:500;">${labName}</p>
    <ul style="margin:0 0 16px;padding-left:20px;">
      ${addressList}
    </ul>

    ${divider}

    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
      Simply walk in and provide this code at the reception desk. No appointment necessary — your test request has already been registered.
    </p>
  `);
}

// =============================================================================
// TEMPLATE: Doctor — Patient Arrived at Lab
// =============================================================================
export function doctorPatientArrived({
  doctorName,
  patientName,
  labName,
  code,
}: {
  doctorName: string;
  patientName: string;
  labName: string;
  code: string;
}) {
  return base(`
    <h2 style="margin:0 0 8px;color:#0270c3;font-size:20px;font-weight:700;">Patient Has Arrived</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Dear Dr. ${doctorName},<br><br>
      Your patient <strong>${patientName}</strong> has arrived at <strong>${labName}</strong> and their request has been retrieved by the lab.
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
  `);
}

// =============================================================================
// TEMPLATE: Doctor — Tests Completed
// =============================================================================
export function doctorTestsCompleted({
  doctorName,
  patientName,
  labName,
  code,
}: {
  doctorName: string;
  patientName: string;
  labName: string;
  code: string;
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
      Please contact the laboratory or your patient directly to arrange result collection. Thank you for using Poveon Health.
    </p>
  `);
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
    <h2 style="margin:0 0 8px;color:#0259a0;font-size:20px;font-weight:700;">Welcome to Poveon Health</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Your laboratory has been registered on the Poveon Health platform.
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
