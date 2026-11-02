# M1 / M2 production-readiness record

Started 2 November 2026. This work prepares a release candidate; it does not deploy the app or certify live delivery.

## Baseline and preservation

- Original commit: `c3b294c69433efcb2d0c4d9b406c21c1eb693285`.
- Working branch: `codex/production-readiness-m1-m2`.
- No history rewrite, deployment, dependency installation/update, or private `.env` edit.
- Historical backups and development email previews were removed from the Git index only. Local copies remain intact and ignored. Git displays these as staged deletions because future commits must stop distributing them; original application source remains tracked.
- The original commit still contains those files. Do not publish that history without deciding whether it needs sanitizing. No recovery/verification link contents were opened or assessed for validity.
- `npm run check:repository` rejects tracked environment files (except `.env.example`), local mail, source backups, and dependencies. It checks paths only, not contents or history, and is not a complete secret scanner.

## Environment separation

Use `deploy/staging.env.example` and `deploy/production.env.example` as configuration inventories, not active credentials. The server still reads `server/.env` for local development; templates are not loaded automatically.

Before staging or production deployment, the operator must:

- Create separate database credentials scoped to separate staging/production databases, preferably separate projects/clusters where practical.
- Generate independent JWT and Google encryption keys for new environments. Preserve existing Google keys when keeping an existing database.
- Set canonical origins and exact Google callbacks independently. Keep private configuration on the backend host, never in frontend `VITE_*` variables.
- Verify trusted proxy hops against the actual deployment topology; `1` in the templates is the existing direct Render starting point, not a universal value.
- Leave Google variables blank together until configured. Set the callback to the environment's canonical origin plus `/api/google/callback`.
- Keep Vercel previews away from production credentials and data. Hosting accounts and resources have not been provisioned by M1/M2.
- Back up any important existing database and rehearse restoration before migrations or launch. No live database was contacted or backed up during M1/M2.

## M2 changes

- Applying a template honors calendar/bucket selection; bucket creation uses the normal task workflow and retains ownership/validation.
- Scheduling rejects date normalization as well as clock normalization, including Apia's skipped 30 December 2011.
- Calendar/bucket list responses are capped at 5,000 tasks. Larger results return explicit `413 TASK_LIST_TOO_LARGE`, never a silently truncated schedule. Paginated global search remains available for managing large buckets.
- History paging projects only one page and its metadata from MongoDB rather than sending the entire embedded array to Node. Existing task identity, history, and legacy markers are preserved.
- The administration Activity tab can navigate older/newer audit pages.
- Repository privacy validation runs in CI and `npm run verify`.

The embedded history array itself remains unbounded in storage. A separate history collection/retention policy is a future migration, not silently introduced here. Whole-account list pagination and distributed write coordination remain future scaling work. Keep one backend process/instance.

## Requirements held stable

Calendar geometry remains task-defined, with minimum readable heights and independent weekly columns. PDFs remain agendas for all periods. These are existing v0.8.1 behaviors retained for this milestone; changing them to match the original brief's proportional geometry or distinct week/month PDF grids requires a product decision.

## Validation

See `VALIDATION.md` for current commands, results, and limitations. Automated release checks use disposable MongoDB instances, not Atlas. Browser/device, real Google, email delivery, monitoring, backup restoration, and deployment acceptance remain required before public launch.
