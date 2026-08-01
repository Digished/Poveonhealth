# WhatsApp Notifications (Twilio) — Setup Guide

Poveon sends request codes, lab addresses, referral updates and results notices
to **doctors and patients on WhatsApp**, falling back to SMS when WhatsApp can't
deliver.

WhatsApp is **off until credentials are set**. With `TWILIO_ACCOUNT_SID` unset,
every notification behaves exactly as it did before this integration — SMS and
email only.

---

## 1. Quick start (sandbox, ~5 minutes)

Good enough to see real messages arrive on your own phone.

1. Sign up at <https://twilio.com> and open **Console → Account Info**.
2. Copy the **Account SID** and **Auth Token** into `.env.local`:

   ```env
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your-auth-token
   TWILIO_WHATSAPP_FROM=+14155238886
   ```

   `+14155238886` is Twilio's shared sandbox number.

3. Go to **Messaging → Try it out → Send a WhatsApp message**. Twilio shows a
   join code like `join dusty-otter`. Send that message from your phone to the
   sandbox number — this opens a 24-hour window in which free-form messages
   (no template) are allowed.

4. Restart the app and send yourself a test:

   ```bash
   curl -X POST https://your-domain.com/api/admin/whatsapp/test \
     -H 'Content-Type: application/json' \
     -b 'your-admin-session-cookie' \
     -d '{"phone":"+2348012345678"}'
   ```

   `GET` the same URL to see what's configured without sending anything.

Sandbox limits: only numbers that have sent the join code can receive messages,
and the window closes after 24 hours of silence.

---

## 2. Production setup

### 2.1 Get a WhatsApp sender

1. **Messaging → Senders → WhatsApp senders → New sender.**
2. Twilio walks you through Meta Business verification and connecting a phone
   number. Use a number that is *not* already on the WhatsApp consumer app.
3. Once approved, set it as the sender:

   ```env
   TWILIO_WHATSAPP_FROM=+2341234567890
   ```

   Or, if the sender belongs to a Messaging Service (recommended — it gives you
   sender pooling and per-service opt-out handling):

   ```env
   TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

   `TWILIO_MESSAGING_SERVICE_SID` takes precedence over `TWILIO_WHATSAPP_FROM`.

### 2.2 Prefer an API key over the auth token for sending

```env
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=your-api-key-secret
```

Keep `TWILIO_AUTH_TOKEN` set regardless — webhook signature verification is
keyed on the auth token, and **webhooks are rejected when it's missing**.

### 2.3 Register the message templates

WhatsApp only permits free-form text inside a 24-hour customer service window
(i.e. after the person messages you). Everything Poveon sends is
business-initiated, so each notification needs a template approved in
**Messaging → Content Template Builder**.

Create each template below, wait for approval, then paste its `HX…` Content SID
into the matching env var. **The variable numbering is a contract** — the app
fills `{{1}}`, `{{2}}`, … in exactly this order (see
`src/lib/whatsapp/templates.ts`).

#### `TWILIO_WA_TEMPLATE_REQUEST_CODE` — patient, lab request created

Category: **Utility**

```
Hi {{1}}, your lab request at {{2}} has been received.

Request code: {{3}}
Address: {{4}}
Phone: {{5}}

Show this code at the lab reception.
Details: {{6}}
```

| Var | Value |
|-----|-------|
| 1 | Patient first name |
| 2 | Lab name |
| 3 | Request code |
| 4 | Lab address |
| 5 | Lab phone number(s) |
| 6 | Request tracking URL |

#### `TWILIO_WA_TEMPLATE_DOCTOR_REQUEST` — doctor, request confirmation

Category: **Utility**

```
Hi {{1}}, your lab request for {{2}} has been sent to {{3}}.

Request code: {{4}}
Lab address: {{5}}
Lab phone: {{6}}

The patient has been sent this code by WhatsApp.
```

| Var | Value |
|-----|-------|
| 1 | Doctor first name |
| 2 | Patient name |
| 3 | Lab name |
| 4 | Request code |
| 5 | Lab address |
| 6 | Lab phone number(s) |

#### `TWILIO_WA_TEMPLATE_RESULTS_READY` — results available

Category: **Utility**

```
Hi {{1}}, lab results for {{2}} ({{4}}) are ready at {{3}}.

View: {{5}}
```

| Var | Value |
|-----|-------|
| 1 | Recipient first name |
| 2 | Patient name |
| 3 | Lab name |
| 4 | Request code |
| 5 | Result link, or "Sent to your email" |

#### `TWILIO_WA_TEMPLATE_REFERRAL_CREATED` — patient, referral created

Category: **Utility**

```
Hi {{1}}, {{2}} has referred you to {{3}} ({{4}}).

Referral code: {{5}}
Present this code at the hospital.
Track: {{6}}
```

| Var | Value |
|-----|-------|
| 1 | Patient first name |
| 2 | Referring doctor name |
| 3 | Hospital name |
| 4 | Specialty |
| 5 | Referral code |
| 6 | Tracking URL |

#### `TWILIO_WA_TEMPLATE_REFERRAL_STATUS` — patient, referral accepted/rejected/redirected

Category: **Utility**

```
Hi {{1}}, update on referral {{2}}.

{{3}}
Track: {{4}}
```

| Var | Value |
|-----|-------|
| 1 | Patient first name |
| 2 | Referral code |
| 3 | Status sentence |
| 4 | Tracking URL |

> Without a Content SID the app still attempts a free-form send. That works on
> the sandbox and inside an open 24-hour window; outside it Twilio returns
> error **63016** and the notification falls back to SMS.

### 2.4 Configure the webhooks

Both URLs are derived from `NEXT_PUBLIC_APP_URL` automatically — you only need
to set them in the Twilio console.

| Purpose | Twilio setting | URL |
|---------|----------------|-----|
| Delivery receipts | Messaging Service → Integration → *Status callback URL* | `https://your-domain.com/api/webhooks/whatsapp/twilio` |
| Inbound messages | Messaging Service → Integration → *Request URL* (or the sender's "A message comes in") | `https://your-domain.com/api/webhooks/whatsapp/twilio/inbound` |

Override with `TWILIO_STATUS_CALLBACK_URL` / `TWILIO_INBOUND_WEBHOOK_URL` only
when the public URL differs from `NEXT_PUBLIC_APP_URL` — the signature check
validates against the exact URL Twilio was configured with.

Both endpoints verify `X-Twilio-Signature` and reject anything unsigned with
403.

---

## 3. What gets sent, and to whom

| Trigger | Recipient | Template | SMS fallback |
|---------|-----------|----------|--------------|
| Doctor creates a lab request (`/api/requests/create`) | Patient | `requestCode` — code, lab name, **address**, phone, link | ✅ |
| Doctor creates a lab request | Doctor | `doctorRequest` — code, patient, lab **address**, phone | ❌ (email only, as before) |
| Patient self-service request (`/api/requests/patient-create`) | Patient | `requestCode` | ✅ |
| Results sent (`/api/requests/send-results`) | Patient + doctor | `resultsReady` | ❌ |
| Referral created | Patient | `referralCreated` | ✅ |
| Referral accepted / rejected / redirected | Patient | `referralStatus` | ✅ |

Doctors deliberately get **no SMS fallback**: they have always been reached by
email, and adding SMS for them would introduce new per-message spend.

**Results messages carry no clinical content** — only the request code and a
link. The report itself stays in email, so a shared or stolen phone never
exposes results on a lock screen.

---

## 4. Inbound messages

Anyone who messages the WhatsApp sender gets an automatic reply, and their
message opens a 24-hour window (making template-free sends possible until it
closes).

- A message containing a request code (`LABA-8X4K29Q`) is answered with that
  request's status, lab name, **address** and phone.
- `STOP` / `START` are left alone — Twilio's own opt-out handling owns them.
- Anything else gets a short "reply with your request code" pointer.

---

## 5. Guards and cost control

| Guard | Where | Default |
|-------|-------|---------|
| Master switch | `WHATSAPP_ENABLED=false` | on when credentials exist |
| Daily WhatsApp cap | `DAILY_WHATSAPP_CAP` | 1000/day |
| Daily SMS cap (separate) | `DAILY_SMS_CAP` | 500/day |
| SMS fallback | `WHATSAPP_SMS_FALLBACK=false` to disable | on |
| Per-phone hourly SMS limit | doctor-created requests | 3/hr |
| Nigeria-only SMS | `isValidNigerianPhone` | always |

The two channel caps count independently, so WhatsApp running hot never
silences SMS (or the reverse). WhatsApp accepts international numbers; the SMS
fallback stays Nigeria-only, matching the Termii account.

Every send is written to `sms_logs` with `channel = 'whatsapp'` and the Twilio
message SID, which the status webhook then updates through
`pending → sent → delivered → read` (or `failed`).

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Nothing sends, log says `not configured` | Missing SID/credentials/sender | Set `TWILIO_ACCOUNT_SID`, credentials, and a sender |
| Error **63016** | Free-form send outside the 24h window | Configure the approved Content SID for that notification |
| Error **63015** | Sandbox recipient hasn't joined | Send the `join …` code from that phone |
| Error **63003** / **63051** | Number has no WhatsApp account | Expected — SMS fallback covers it |
| Error **21606** | `From` isn't a WhatsApp-enabled sender | Check `TWILIO_WHATSAPP_FROM` / the Messaging Service |
| Webhook 403s | `TWILIO_AUTH_TOKEN` unset, or callback URL ≠ configured URL | Set the token; set `TWILIO_STATUS_CALLBACK_URL` to the exact console value |
| Statuses stuck at `sent` | Status callback not configured | Add the status callback URL in the console |

Run `GET /api/admin/whatsapp/test` (admin session required) for a live view of
which pieces are configured.

---

## 7. Code map

| File | Role |
|------|------|
| `src/lib/whatsapp/config.ts` | Env reading, feature flags, template SIDs |
| `src/lib/whatsapp/phone.ts` | E.164 normalisation (`toE164`) |
| `src/lib/whatsapp/twilio.ts` | REST send + `X-Twilio-Signature` verification |
| `src/lib/whatsapp/templates.ts` | Message bodies + template variables |
| `src/lib/whatsapp/index.ts` | Public send API — caps, logging |
| `src/lib/notify.ts` | WhatsApp-first / SMS-fallback dispatcher |
| `src/lib/message-log.ts` | Writes `sms_logs` rows for both channels |
| `src/app/api/webhooks/whatsapp/twilio/` | Status + inbound webhooks |
| `src/app/api/admin/whatsapp/test/` | Admin config check and test send |
