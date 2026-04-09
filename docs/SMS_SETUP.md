# SMS Provider Setup Guide

This document explains how to configure Sendchamp or Termii SMS providers and enable delivery status webhooks.

## Quick Start

### 1. Choose Your Provider

Set `SMS_PROVIDER` in `.env.local`:

```env
# Use Sendchamp (recommended for Africa/Nigeria - no sender ID approval required)
SMS_PROVIDER=sendchamp
SENDCHAMP_API_KEY=your-api-key-from-sendchamp

# OR use Termii (legacy, currently in use)
SMS_PROVIDER=termii
TERMII_API_KEY=your-api-key-from-termii
TERMII_BASE_URL=https://v3.api.termii.com (optional, defaults shown)
```

## Provider Details

### Sendchamp

**Advantages:**
- No sender ID registration required
- Direct support for African phone numbers
- Better delivery rates for Nigeria
- Simple integration

**Setup:**
1. Sign up at https://sendchamp.com
2. Go to Settings > API Keys
3. Copy your API key to `SENDCHAMP_API_KEY`
4. Verify your app URL is set in `.env.local`:
   ```env
   NEXT_PUBLIC_APP_URL=https://your-production-domain.com
   ```

**Webhook Configuration (Optional):**
1. In Sendchamp dashboard: Settings > Webhooks
2. Add new webhook:
   - **Event:** SMS Status Updates
   - **URL:** `https://your-production-domain.com/api/webhooks/sms/sendchamp`
   - Save

Once configured, Sendchamp will POST delivery status updates:
- `Sent`: Message accepted by provider
- `Delivered`: Confirmed delivery to phone
- `Failed`: Delivery failed

### Termii

**Setup:**
1. Sign up at https://termii.com
2. Go to Settings > API Keys
3. Copy your API key to `TERMII_API_KEY`

**Webhook Configuration (Optional):**
1. In Termii dashboard: Settings > Webhooks
2. Add new webhook:
   - **Event:** SMS Delivery Status
   - **URL:** `https://your-production-domain.com/api/webhooks/sms/termii`
   - Save

## Webhook Integration

### Why Webhooks?

Webhooks are **optional** for basic functionality. SMS sending works without them (fire-and-forget).

However, webhooks enable:
- **Delivery Tracking:** See which SMS were successfully delivered
- **Analytics:** Monitor SMS performance
- **Debugging:** Identify delivery failures

### How Webhooks Work

1. Your app sends SMS via provider
2. Provider returns a `message_id`
3. Webhook endpoint stores message ID in database
4. Provider sends status update to webhook
5. Webhook updates SMS status in database

### Database

SMS logs are stored in `sms_logs` table:

```sql
SELECT * FROM sms_logs 
WHERE provider = 'sendchamp' 
  AND status != 'delivered' 
ORDER BY created_at DESC;
```

Status values: `pending`, `sent`, `delivered`, `failed`

## Testing

### Without Webhooks (Local Development)

```bash
# Set provider (no webhook needed)
SMS_PROVIDER=sendchamp
SENDCHAMP_API_KEY=your-test-key

# SMS will send but delivery status won't be tracked
# Check logs: [sendchamp] SMS sent to +234...
```

### With Webhooks (Production)

1. Deploy to production with HTTPS
2. Configure webhook URL in provider dashboard
3. Send test SMS
4. Verify webhook received:
   ```bash
   # Check app logs for: [sendchamp-webhook] Updated SMS log
   ```
5. Query delivery status:
   ```sql
   SELECT status FROM sms_logs ORDER BY created_at DESC LIMIT 1;
   ```

## API Documentation

### Sendchamp
- Docs: https://sendchamp.com/docs
- API Reference: https://api.sendchamp.com/docs
- Support: support@sendchamp.com

### Termii
- Docs: https://developers.termii.com
- SMS Endpoint: https://v3.api.termii.com/api/sms/send
- Webhook Docs: https://developers.termii.com/inbound
- Support: support@termii.com

## Troubleshooting

### SMS Not Sending

Check logs for:
```
[sendchamp] SENDCHAMP_API_KEY not set — SMS skipped
[termii] TERMII_API_KEY not set — SMS skipped
```

**Fix:** Ensure API key is set in `.env.local` and app is restarted.

### Webhook Not Received

1. Verify `NEXT_PUBLIC_APP_URL` is set to production domain
2. Test webhook endpoint:
   ```bash
   curl -X POST https://your-domain.com/api/webhooks/sms/sendchamp \
     -H "Content-Type: application/json" \
     -d '{"events": [{"id": "test-123", "status": "Delivered"}]}'
   ```
3. Check app logs for webhook processing
4. Verify webhook URL in provider dashboard matches exactly

### Wrong Phone Format

SMS modules handle phone normalization:

```typescript
// These all work:
sendSms("08001234567", "Hello");      // Nigerian shorthand
sendSms("2348001234567", "Hello");    // Country code only
sendSms("+2348001234567", "Hello");   // E.164 format
sendSms("+234 800 123 4567", "Hello"); // With spaces
```

## Environment Variables Reference

```env
# SMS Provider selection
SMS_PROVIDER=sendchamp|termii

# Sendchamp
SENDCHAMP_API_KEY=...

# Termii (optional base URL override)
TERMII_API_KEY=...
TERMII_BASE_URL=https://v3.api.termii.com

# Required for webhooks to work
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```
