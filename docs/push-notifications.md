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

## The daily reminder

`src/app/api/internal/care-reminders/route.ts` is what makes a treatment plan
and a symptom check-in more than a page a member has to remember to open. It
looks at every active member, works out what is due, and sends at most one
push per member per day covering all of it — three overdue checklist items and
a check-in are one notification, not four.

It does not run on its own. `vercel.json` schedules it daily at 08:00 UTC via
Vercel Cron, which issues a `GET` carrying `Authorization: Bearer $CRON_SECRET`.
Anything else that can hold a secret can call it too, with either verb and the
secret in `?secret=` or the same header:

```
curl -X POST "https://poveon.com/api/internal/care-reminders?secret=$CARE_REMINDER_SECRET"
```

Environment:

- `CRON_SECRET` — set this in the Vercel project and the scheduled run works.
- `CARE_REMINDER_SECRET` — optional second secret for calling it by hand.

With neither set the endpoint answers 401 to everyone: an unset secret means
the job is switched off, never that it is open.

`consult_patients.reminded_at` is the high-water mark. It is stamped whether or
not a push actually landed, so a member with no subscribed device is not
re-examined on every run, and a retry or a manual run cannot double-notify
anyone within the quiet window.
