# Public release checklist

**Scope change, 3 November 2026:** the operator stopped the public hosted-service launch effort. Planora remains a personal deployment. Prepare a separate clean source-release package; keep GitHub private and licensing deferred until ownership/contribution rights are reviewed. Items below are retained as a historical checklist, not requirements to block personal use.

This is a release gate, not a claim that Planora is ready for unrestricted production use. Regular user features are intended to remain free; administration remains restricted. Free infrastructure has quotas and availability limitations.

## Confirmed baseline

- [x] Staging frontend, backend, and Atlas database deployed.
- [x] Automated verification passed for the PWA release: 135 tests, build, production smoke.
- [x] User reported core scheduling, recurrence/templates, reviews/progress, and account workflows passing.
- [x] User reported installed PWA launch, offline recovery, Google sync/update/removal, and exports passing.
- [ ] Record a fresh full verification run for the final release commit.

## Public integrations

- [x] Confirm Google Console Data Access classifications match actual scopes: `openid`, `email`, `https://www.googleapis.com/auth/calendar.app.created`. Read-only Console inspection on 3 November 2026 showed all three under non-sensitive scopes, with sensitive/restricted tables empty.
- [ ] Complete production audience and applicable branding/domain/verification steps; do not broaden scopes to avoid reviewing the current configuration.
  - Console inspection: publishing remains Testing; Publish app is disabled with an instruction to complete Branding. Home, privacy, and terms URLs are empty. No Console configuration was changed.
- [ ] Verify connection and sync using a Google account never listed as a test user.
- [ ] Establish a public email sender. Existing Resend test-sender delivery is not sufficient.
- [ ] Evaluate SMTP2GO free HTTPS API with a verified single sender: account acceptance and real verification/reset delivery to another inbox must pass before switching.
- [ ] Confirm free-tier quotas, overage behavior, and no automatic paid upgrade for every service.

## Privacy and account lifecycle

- [x] Confirm operator name and public support/security contact: MD. Shawon Hossain, shawon12hossain@gmail.com. Copyright year 2026. License deferred; repository must remain private.
- [ ] Publish accurate privacy and terms pages covering task data, account email, Google tokens/calendar data, providers, retention, and service limits.
  - Prepared public `/about.html`, `/privacy.html`, and `/terms.html` with account-deletion and retention gaps explicitly disclosed. Keep them aligned with future implementation and operator retention decisions.
- [ ] Provide an authenticated, password-confirmed account deletion workflow and define backup retention and remote Google calendar behavior.
- [ ] Test deletion ownership, session invalidation, associated data removal, and in-flight Google sync behavior.
- [ ] Verify Google disconnect/revocation and clarify that installed browser reminders require the application to remain open.

## Operations and security

- [ ] Decide canonical public deployment and separate its database/credentials from staging.
- [ ] Configure monitoring and sanitized error logs; verify proxy-aware request limits and abuse controls.
- [ ] Rehearse encrypted backup and restoration in an isolated database; document retention and operator recovery.
- [ ] Review authorization across all account-owned resources and admin controls.
- [ ] Check dependency advisories and test representative multi-user load against an isolated environment.
- [ ] Test accessibility, installed-app OAuth return/downloads, and a two-tab PWA update with unsaved forms.
- [ ] Verify rollback instructions and previous compatible release availability.

## Repository and announcement

- [ ] Choose license and confirm copyright holder; adding a permissive license is an explicit rights decision.
- [ ] Review all branches/tags/history that would become visible for credentials, mail previews, backups, and personal information. A tracked-path check alone is insufficient. Revoke exposed credentials before publication.
- [ ] Review dependency licenses and asset attribution.
- [ ] Update README with final URL, screenshots without private data, feature limits, setup, tests, deployment, and support links.
- [ ] Add contribution/security guidance, issue templates, changelog, and a versioned release.
- [ ] Obtain explicit approval before changing repository visibility or publishing an announcement.
- [ ] Prepare LinkedIn copy that accurately describes free access, service limits, PWA installation, and Google/email availability.

## Free-email feasibility references

Checked 3 November 2026; recheck before changing live configuration:

- [SMTP2GO free plan](https://support.smtp2go.com/hc/en-gb/articles/223087947-Free-Plan): 1,000 messages/month and 200/day; account approval and policies apply.
- [API sender verification](https://developers.smtp2go.com/docs/getting-started): domain or single sender verification.
- [Rate limits](https://developers.smtp2go.com/docs/rate-limiting): 25/hour when no sender domain is verified.
- [HTTPS email API](https://developers.smtp2go.com/docs/send-an-email): suitable for hosts that block SMTP ports.

No external account or production publishing change is implied by this checklist.
