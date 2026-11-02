# Install Planora

Planora is an online-first Progressive Web App. It can use the existing free HTTPS Vercel address; a purchased domain is not required.

## Installation

1. Open the deployed Planora website in your browser.
2. On Android Chrome, choose **Install Planora** in the app or use the browser menu's **Install app** / **Add to Home screen** option.
3. On desktop Chrome or Edge, use **Install Planora** or the browser's installation menu/address-bar icon.
4. On iPhone or iPad, open the website in Safari, choose **Share**, then **Add to Home Screen**. Enable **Open as Web App** if offered.
5. Launch the new Planora icon and sign in if requested. Browser and installed-app sessions can differ by platform.

The browser controls installation availability. If an installation prompt is unavailable, Planora displays manual instructions.

## Connection and updates

An internet connection is required to load or save tasks. Offline changes are not queued. Opening the app without a connection shows a public reconnect screen. A free backend may also take time to wake up.

When an update is ready, save your current form before choosing **Reload update** and confirming. Other open tabs are informed of updates and do not reload automatically.

Installing the app does not add background push notifications. Existing browser reminders require Planora to remain open; Google Calendar reminders follow the configured Google integration.

## Cache boundaries

The service worker precaches only the public reconnect page and its CSS/JavaScript. It may cache content-hashed public build assets. It does not cache API calls, authenticated HTML, account responses, exports, or Google OAuth traffic. Navigations use the network; failed connections or server errors fall back to the public reconnect screen.

The worker cleans up its own previous caches and retains one prior build-asset cache for open tabs. It does not remove unrelated origin caches. Updates activate after user confirmation, except for the first installation.

## Maintenance and acceptance

- Run `node scripts/generate-pwa-icons.mjs` to regenerate the existing calendar artwork without additional dependencies.
- Run `npm run verify` for repository checks, worker/install behavior tests, production build, and production startup/PWA asset smoke checks.
- Serve the production build to exercise the service worker; development mode does not register it.
- Verify actual Android/iOS/desktop installation, standalone launch, sign-in, Google connect/return, and export downloads on the devices you support. These device checks remain manual release acceptance.
- Test an update with an unsaved form in a second tab: it must wait for the user's reload decision.

This implementation does not remove the staging restrictions for email delivery, Google consent, hosting reliability, or production data separation described in [STAGING.md](./STAGING.md).
