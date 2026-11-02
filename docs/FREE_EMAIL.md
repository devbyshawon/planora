# Free public email candidate: SMTP2GO

Planora supports SMTP2GO's HTTPS API as an optional delivery mode. Existing Resend and SMTP modes remain supported. No account switch occurs until the operator changes private hosting settings.

## Operator setup

1. Create a free SMTP2GO account and complete its account/sending approval steps. Do not choose a paid upgrade.
2. Under **Sending → Verified Senders**, add and verify a **Single sender email** address you control. Domain verification is preferable for deliverability but single-address verification is the no-owned-domain candidate.
3. Under **Sending → API Keys**, create a restricted sending key as offered by the dashboard. Keep the key private.
4. After deploying a build with this integration, enter these settings directly into Render's private Environment page:
   - `MAIL_MODE=smtp2go`
   - `SMTP2GO_API_KEY`: the private API key
   - `MAIL_FROM`: the exact verified sender, optionally formatted as `Planora <your-verified-address>`
5. Keep the old provider settings privately available for rollback. Save/redeploy. Do not paste any keys, account links, or reset tokens into issues or chat.
6. Using a separate account/inbox you control, exercise verification and password reset. Check inbox and spam, expiry, single use, and continued planner access. Provider acceptance is not a guarantee of inbox delivery.
7. Confirm the account is on the free plan and review sending limits in the dashboard. Official documentation lists 1,000/month, 200/day, and 25/hour without a verified sender domain. Set usage alerts/limits where available; do not promise unlimited emails.

If single-sender setup or account approval is refused, do not bypass provider policies. Restore the previous mode and reassess the no-cost requirement. A provider change alone does not establish production readiness.

## Implementation boundaries

Requests go only to `https://api.smtp2go.com/v3/email/send`, with a 15-second timeout and redirects rejected. Only the intended recipient receives the requested verification/reset message. HTTP success also requires `data.succeeded === 1` and `data.failed === 0`. Provider failures are returned as sanitized errors. No automatic retries are used because this integration does not establish provider idempotency; uncertain delivery should be retried deliberately through the normal account workflow.

References: [free plan](https://support.smtp2go.com/hc/en-gb/articles/223087947-Free-Plan), [sender verification/API setup](https://developers.smtp2go.com/docs/getting-started), [sending API](https://developers.smtp2go.com/docs/send-an-email), [rate limits](https://developers.smtp2go.com/docs/rate-limiting). Checked 3 November 2026.
