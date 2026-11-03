# Install Planora

Planora is an installable Progressive Web App with [offline support in the original interface](./OFFLINE.md). It can use the existing free HTTPS Vercel address; a purchased domain is not required.

## Installation

1. Open the deployed Planora website in your browser.
2. On Android Chrome, choose **Install Planora** in the app or use the browser menu's **Install app** / **Add to Home screen** option.
3. On desktop Chrome or Edge, use **Install Planora** or the browser's installation menu/address-bar icon.
4. On iPhone or iPad, open the website in Safari, choose **Share**, then **Add to Home Screen**. Enable **Open as Web App** if offered.
5. Launch the new Planora icon and sign in if requested. Browser and installed-app sessions can differ by platform.

The browser controls installation availability. If an installation prompt is unavailable, Planora displays manual instructions.

## Connection and updates

After an initial online sign-in and completed app update, the same planner works from the saved device copy when offline. Supported edits are queued and sync while the app is open and connected, waiting for open dialogs to close. PDF/CSV/ICS downloads also work locally. Google, account emails, password/email changes, sign-in, and administration still need their services. See [OFFLINE.md](./OFFLINE.md).

When an update is ready, save your current form before choosing **Reload update** and confirming. Other open tabs are informed of updates and do not reload automatically.

Installing the app does not add background push notifications. Existing browser reminders require Planora to remain open; Google Calendar reminders follow the configured Google integration.

## Cache boundaries

The service worker precaches the public application shell, build JavaScript/CSS, and reconnect page. It does not cache API calls, authenticated HTML, account responses, exports, or Google OAuth traffic. Network failures at the root/workspace URL fall back to the workspace shell; other navigations use the reconnect screen. Private offline snapshots and queued changes are stored separately in IndexedDB after online sign-in. Sign out online after syncing to clear the readable device copy.

The worker cleans up its own previous caches and retains one prior build-asset cache for open tabs. It does not remove unrelated origin caches. Updates activate after user confirmation, except for the first installation.

## Maintenance and acceptance

- Run `node scripts/generate-pwa-icons.mjs` to regenerate the existing calendar artwork without additional dependencies.
- Run `npm run verify` for repository checks, worker/install behavior tests, production build, and production startup/PWA asset smoke checks.
- Serve the production build to exercise the service worker; development mode does not register it.
- Verify actual Android/iOS/desktop installation, standalone launch, sign-in, Google connect/return, and export downloads on the devices you support. These device checks remain manual release acceptance.
- Test an update with an unsaved form in a second tab: it must wait for the user's reload decision.

This implementation does not remove the staging restrictions for email delivery, Google consent, hosting reliability, or production data separation described in [STAGING.md](./STAGING.md).
