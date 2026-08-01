# Patient/Doctor Messaging Instances Checklist

Complete list of all places where the app messages a patient or doctor on a
phone number.

Since the WhatsApp integration, these no longer call `sendSms` directly. They go
through **`notify()`** in `/src/lib/notify.ts`, which tries WhatsApp first and
falls back to SMS. See [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md) for the WhatsApp
side and [SMS_SETUP.md](./SMS_SETUP.md) for the SMS provider.

## 1. Doctor Creates Request
**File:** `/src/app/api/requests/create/route.ts` (in `sendNotifications`)
**Condition:** Only if `data.patient_phone` is provided
**Message:** Request code, lab name, **lab address**, lab phone, tracking link
**Recipient:** Patient
**Channels:** WhatsApp → SMS fallback (`tag: "request-code"`)
**Guards:** per-phone hourly cap, daily SMS cap, daily WhatsApp cap
```typescript
await notify({
  phone: data.patient_phone,
  whatsapp: waTemplates.patientRequestCode({ ...code, labAddress, labPhones }),
  sms: buildPatientRequestSms({ ... }),
  smsRateLimit: true,
  tag: "request-code",
});
```

## 2. Doctor Confirmation (Doctor Creates Request)
**File:** `/src/app/api/requests/create/route.ts` (in `sendNotifications`)
**Condition:** Only if the doctor has a phone on file (form field or DoctorProfile)
**Message:** Request code, patient name, lab name, **lab address**, lab phone
**Recipient:** Doctor
**Channels:** WhatsApp only — **no SMS fallback** (doctors are reached by email,
and SMS for them would be new per-message spend)

## 3. Patient Creates Request (Self-Service)
**File:** `/src/app/api/requests/patient-create/route.ts`
**Condition:** Always (phone is required in the schema)
**Message:** Request code, lab name, **lab address**, lab phone, tracking link
**Recipient:** Patient
**Channels:** WhatsApp → SMS fallback (`tag: "patient-create"`)

## 4. Results Sent
**File:** `/src/app/api/requests/send-results/route.ts`
**Condition:** Whenever the patient/doctor has a phone on the request
**Message:** "Results ready" notice — code + link only, **no clinical content
and no attachment** (the report stays in email)
**Recipient:** Patient and doctor
**Channels:** WhatsApp only, no SMS fallback

## 5. Referral Created
**File:** `/src/lib/referral-notify.ts` → `notifyReferralCreated`
**Message:** Referral code, referring doctor, hospital, specialty, tracking link
**Recipient:** Patient
**Channels:** WhatsApp → SMS fallback

## 6. Referral Accepted / Rejected / Redirected
**File:** `/src/lib/referral-notify.ts` → `notifyReferralStatus`
**Message:** Status update + tracking link
**Recipient:** Patient
**Channels:** WhatsApp → SMS fallback

## 7. Inbound WhatsApp Reply
**File:** `/src/app/api/webhooks/whatsapp/twilio/inbound/route.ts`
**Trigger:** Anyone messaging the WhatsApp sender
**Message:** Request status + lab name/**address**/phone when the message
contains a request code; otherwise a short pointer
**Channels:** WhatsApp (TwiML reply)

## Not implemented

| Idea | Notes |
|------|-------|
| Doctor OTP login by SMS/WhatsApp | Would live in `/api/doc-login/*` |
| Patient portal access code | Would live in patient auth routes |
| Lab staff alerts for urgent requests | Would live in the request creation flow |

---

## Debugging delivery issues

### Log prefixes to grep for

```
[notify] <tag>: ...                    ← channel selection and fallback decisions
[whatsapp] <tag> ...                   ← caps, invalid numbers, disabled
[twilio-wa] ✅ Queued to ... sid=...    ← accepted by Twilio
[twilio-wa] Send failed [status code=]  ← rejected by Twilio
[twilio-wa-webhook] sid=... status=...  ← delivery receipt
[termii] ✅ Sent to ...                 ← SMS accepted
[sms-guard] ⚠️  Daily ...               ← approaching a cap
```

### Checklist
- [ ] Is a phone number actually present on the request?
- [ ] `GET /api/admin/whatsapp/test` — is WhatsApp configured and enabled?
- [ ] Is `TERMII_API_KEY` set for the SMS fallback?
- [ ] Did a cap trip? Look for `daily cap reached` in the logs
- [ ] Is the number Nigerian? The SMS fallback is Nigeria-only; WhatsApp is not
- [ ] Twilio error 63016 → the notification needs an approved template SID
- [ ] Check the `sms_logs` table: `channel`, `status`, `error_code`

### Log locations
- **Vercel Logs:** Project > Deployments > Select Deployment > Logs
- **Database:** `sms_logs` table (both channels, discriminated by `channel`)
- **Twilio Console:** Monitor > Logs > Messaging
- **Termii Dashboard:** Message Logs

---

## Current configuration
- **WhatsApp:** Twilio — off unless `TWILIO_ACCOUNT_SID` + credentials + sender are set
- **SMS:** Termii, sender ID `N-Alert`, DND channel
- **Order:** WhatsApp first, SMS fallback (`WHATSAPP_SMS_FALLBACK=false` to disable)
- **Logging:** every send writes an `sms_logs` row; webhooks update the status
