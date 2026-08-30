# Push notifications

The installed app can tell a doctor that a member has written to them, and a
member that their doctor has replied, while the app is closed. Email still goes
out for both — push is the fast nudge, email is the durable copy.

## Turning it on

Push needs a VAPID key pair. Without it, nothing breaks: `pushAvailable()`
returns false, the toggle hides itself, and messages send exactly as before.

Generate a pair once:

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Then set three environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the `publicKey` — reaches the browser, so it is public by design |
| `VAPID_PRIVATE_KEY` | the `privateKey` — server only |
| `VAPID_SUBJECT` | `mailto:` address the push services can reach you at (defaults to `mailto:support@poveon.com`) |

**Keep the pair stable.** Every device's subscription is tied to the public key
it was created with; rotating the keys silently invalidates every existing
subscription, and each person has to turn notifications on again.

## How it fits together

- `src/lib/push.ts` — sending. Best-effort by design: a failed push must never
  fail the message it was announcing, so callers do not await it.
- `src/app/api/push/subscribe/route.ts` — a device registers against whichever
  session is signed in, so a shared phone in the patient portal never receives
  a doctor's alerts. Re-registering the same browser updates the owner rather
  than duplicating it.
- `public/sw.js` — the `push` and `notificationclick` handlers. Tapping focuses
  an already-open tab rather than opening a second copy of the app.
- `src/components/pwa/PushToggle.tsx` — the per-device switch, in Security on
  both portals. Permission is only requested when someone presses the button;
  asking unprompted is how people say no permanently.

Subscriptions the push service reports as gone (404/410) are deleted on the
spot, so the table does not fill with dead endpoints.

## What it does not do

- iOS only delivers web push to apps added to the home screen, on iOS 16.4+.
  In Safari's normal browsing the toggle appears but the subscription will not
  be created — that is Apple's rule, not a bug here.
- Nothing is queued. A device that is off simply misses the notification; the
  message is still in the thread and the email still arrives.
