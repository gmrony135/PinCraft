# PinCraft email system: setup and status

Sender: **PinCraft <dream.boost154@gmail.com>** (Dream Boost account). The owner's personal address is never used as sender.
Provider: Gmail API, OAuth scope `gmail.send` only. Cost: $0 (Gmail account, no provider signup).

## Emails
| # | Email | Trigger |
|---|---|---|
| 1 | Registration confirmation | Firebase verification email. Template: `email-templates/firebase-verify-bn.html` (paste by the owner in Firebase console > Authentication > Templates) |
| 2 | Welcome, once per account | Verified sign-in, accounts created on or after 20 Nov 2026 (06:00 Dhaka) |
| 3 | Weekly usage summary | Saturdays from 10:00 Dhaka, accounts with activity that week only |
| 4 | 24-hour "come back" | No recorded visit for 24 h (lapsed at most 7 days), max one per 24 h |
| 5 | Admin alerts to gmrony135@gmail.com | New registration, payment request |

Unsubscribe links are on emails 3 and 4. Messages are queued in `email_outbox`, expire after 48 hours, and are never sent late.

## Connecting the Dream Boost Gmail (owner, one time, on a phone)
1. Google Cloud project `pincraft-ly`: Gmail API enabled, `gmail.send` on the consent screen, and the OAuth client's authorised redirect URIs include `https://pincraftly.vercel.app/api/internal/gmail/callback`.
2. Sign in to https://pincraftly.vercel.app as the owner account (gmrony135@gmail.com).
3. Open https://pincraftly.vercel.app/api/internal/gmail/connect
4. On Google's screen, choose **dream.boost154@gmail.com** and tap **Allow** for "Send email on your behalf".
5. You should see "Gmail connected". Anything else (wrong account, expired link) saves nothing. Start again from step 3.

The refresh token is stored encrypted in Firestore (`email_system/gmail`), never in the repo or in plain text. Reconnect with the same steps if Google revokes access (the tick then stops and reports `reauth_required`).

## Scheduler
A cron-job.org job "PinCraft email tick" (ID 8905938) exists and is **disabled**. Enable it only after the owner approves live sending:
- POST `https://pincraftly.vercel.app/api/internal/email/tick`
- Header `Authorization: Bearer <EMAIL_CRON_SECRET>`
- Every 10 minutes

## Environment variables (Vercel, Production)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: existing (shared with the Blogger connection)
- `EMAIL_UNSUBSCRIBE_SECRET`, `EMAIL_CRON_SECRET`: existing, do not change
- `AUTOMATION_ENCRYPTION_KEY`: existing (encrypts the Gmail grant)

## Limits
- Gmail sending limits apply to the Dream Boost account (daily recipient limits). Check Gmail's current limits before large sends.
- Re-engagement and weekly emails are paced by their rules. Welcome and admin alerts are one per event.
- Weekly summary gaps: articles written are not counted separately (text requests are shown). Blogger posts published are not included, because no per-user count is stored in a readable form.
