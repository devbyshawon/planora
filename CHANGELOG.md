# Changelog

## Unreleased — public launch preparation

- Verification cooldowns now return an explicit no-send response instead of the same message used after provider acceptance. Failed delivery retains a cooldown to limit repeated provider requests.

- Optional SMTP2GO HTTPS account email delivery for verified senders; live provider migration and real inbox acceptance remain pending.
- Public release checklist, contribution and security reporting guidance, and issue/pull request templates.

## 0.8.1 — staging PWA milestone

- Online-first installable PWA with calendar icons, manifest, public offline reconnect screen, and user-confirmed updates.
- API and private document responses bypass service-worker caching.
- PWA behavior tests and production asset smoke checks.
- Existing exact-time planner, recurrence/templates, account workflows, Google Calendar integration, and PDF/CSV/ICS exports retained.

See [VALIDATION.md](./VALIDATION.md) and [STAGING.md](./docs/STAGING.md) for scoped evidence and outstanding release checks. This changelog does not imply public production readiness.
