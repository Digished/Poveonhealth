# SMS Sending Instances Checklist

Complete list of all places where SMS is sent in the application.

## 1. Doctor Creates Request
**File:** `/src/app/api/requests/create/route.ts:271`
**Condition:** Only if `data.patient_phone` is provided
**Message:** Patient lab request code
**Type:** Fire-and-forget
**Recipient:** Patient (if phone provided)
```typescript
if (data.patient_phone) {
  sendSms(data.patient_phone, buildPatientRequestSms({...}))
}
```

## 2. Patient Creates Request (Self-Service)
**File:** `/src/app/api/requests/patient-create/route.ts:166`
**Condition:** Always (phone is required in schema)
**Message:** Patient lab request code
**Type:** Fire-and-forget
**Recipient:** Patient
```typescript
sendSms(data.patient_phone, buildPatientRequestSms({...}))
```

## 3. Doctor OTP Login
**Status:** ❌ NOT IMPLEMENTED
**Description:** SMS OTP for doctor login could be sent but isn't currently implemented
**Location:** Would be in `/api/doctors/otp/*` routes
**Potential Addition:** Send 6-digit OTP to doctor's phone

## 4. Patient Portal Access
**Status:** ❌ NOT IMPLEMENTED
**Description:** SMS access code or OTP for patient portal could be sent but isn't currently
**Location:** Would be in patient authentication routes
**Potential Addition:** Send code to patient's phone for portal access

## 5. Lab SMS Notifications
**Status:** ❌ NOT IMPLEMENTED
**Description:** Could notify lab staff of new requests via SMS
**Location:** Would be in request creation flow
**Potential Addition:** Notify lab of urgent/critical requests via SMS

---

## Debugging SMS Delivery Issues

If SMS isn't working, check logs for these messages:

### In Vercel Logs
```
[api/requests/create] Sending SMS to patient: <phone>
[api/requests/patient-create] Sending SMS to patient: <phone>
[sendchamp] Attempting to send SMS to <phone>
[sendchamp] Formatted phone: <formatted>, Provider: SAlert
[sendchamp] SMS send failed for <phone>: [status] error
[sendchamp] SENDCHAMP_API_KEY not set — SMS skipped
```

### Checklist for Troubleshooting
- [ ] Verify phone number is being provided (check request body)
- [ ] Verify `SMS_PROVIDER` is set (default: sendchamp)
- [ ] Verify `SENDCHAMP_API_KEY` or `TERMII_API_KEY` is set in Vercel env vars
- [ ] Check Vercel logs for "[sendchamp]" or "[termii]" log messages
- [ ] Verify phone format is correct (Nigerian numbers should start with 0 or 234)
- [ ] Check Sendchamp/Termii dashboard for API activity

### Log Locations
- **Vercel Logs:** Project > Deployments > Select Deployment > Logs
- **Database:** `sms_logs` table (if webhooks configured)
- **Sendchamp Dashboard:** Activity/Message History
- **Termii Dashboard:** Message Logs

---

## Current Configuration
- **Default Provider:** Sendchamp
- **Default Sender ID:** SAlert
- **Message Type:** Plain text SMS
- **Fire-and-Forget:** Yes (doesn't block request response)
