# Changelog

## Unreleased — public launch preparation

- Replaced the separate offline workspace with local storage and queued synchronization behind the original planner UI. Shared recurrence/export logic supplies local PDF/CSV/ICS, recurring tasks, templates, history, reviews, progress, and planner settings. Security/network-service actions remain online.

- Opt-in offline workspace for saved account tasks, IndexedDB edits, automatic connected sync, transaction-backed operation receipts, conflict protection, and JSON backup/restore.
- Public hosted launch paused in favor of personal use and a separate source-release package. License remains deferred.

- Public about, privacy, and terms pages with the confirmed support address, accessible without sign-in and linked from sign-in and the planner sidebar.

- Verification cooldowns now return an explicit no-send response instead of the same message used after provider acceptance. Failed delivery retains a cooldown to limit repeated provider requests.

- Optional SMTP2GO HTTPS account email delivery for verified senders; live provider migration and real inbox acceptance remain pending.
- Public release checklist, contribution and security reporting guidance, and issue/pull request templates.

## 0.8.1 — staging PWA milestone

- Online-first installable PWA with calendar icons, manifest, public offline reconnect screen, and user-confirmed updates.
- API and private document responses bypass service-worker caching.
- PWA behavior tests and production asset smoke checks.
- Existing exact-time planner, recurrence/templates, account workflows, Google Calendar integration, and PDF/CSV/ICS exports retained.

See [VALIDATION.md](./VALIDATION.md) and [STAGING.md](./docs/STAGING.md) for scoped evidence and outstanding release checks. This changelog does not imply public production readiness.
