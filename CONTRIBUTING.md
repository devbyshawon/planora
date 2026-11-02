# Contributing to Planora

Read the [README](./README.md), [architecture](./docs/ARCHITECTURE.md), and [validation record](./VALIDATION.md) first. Keep changes focused and preserve exact local dates/times, account ownership checks, and existing workflows.

## Local development

Use the Node version in `.node-version` and follow [START_HERE.md](./START_HERE.md). Use a disposable local database or your own development database, never the public deployment's credentials. Environment examples contain placeholders; do not commit populated environment files, mail previews, database dumps, tokens, or personal screenshots.

Before proposing a change, describe the problem, resulting behavior, and validation. Run `npm run verify`; MongoDB tests and production smoke use disposable test databases and require local port access. Include meaningful regression tests for changed account/security/data behavior. No dependency changes are needed for documentation-only work.

Report ordinary bugs with reproduction steps, expected/actual behavior, browser/OS, and sanitized logs. Do not attach real task data, cookies, Google tokens, reset links, or environment values.

For security concerns, follow [SECURITY.md](./SECURITY.md). Licensing is being finalized for the public release; do not assume a grant of reuse rights until a license is published.
