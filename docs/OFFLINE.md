# Offline use in the original Planora interface

The calendar, task dialogs, views, filters, settings, recurrence/templates, reviews/progress, and export dialog remain the normal Planora interface. There is no separate offline workspace or mode-selection link. The old `/offline-planner.html` address now loads the same application for compatibility.

## First use

Open Planora online, accept the current PWA update (or close all windows and reopen), and sign in. The application saves the account-owned planner on this browser profile. Let the initial load finish before disconnecting. First-time registration, sign-in, and downloading the application need internet.

Use the same interface offline. Local changes are written to IndexedDB before success is returned. Recurrence materializes locally as dates are opened; saved templates, history, search, reviews, progress, categories, display settings, and timezone changes use the saved account data. PDF/CSV/ICS are generated locally using the same export layout/rules and bundled fonts. Browser reminders can run while the app stays open with notification permission; operating systems may suspend it and closed-app delivery is not guaranteed.

Google status may show the saved connection state, but Google requests, OAuth, account emails, password/email changes, session revocation, and administrative actions require their actual online services. They are not reported as completed offline. Offline planner changes sync back to Planora; Google synchronization remains the existing explicit Google workflow.

## Reconnection and conflicts

Sync runs automatically on connection/focus/startup and every minute, and shortly after supported local writes. It waits while a dialog is open to avoid replacing unsaved form data. Keep the app open until pending changes clear. Expired sessions require signing in to the same account.

An account-state signature and chained receipts prevent applying a stale queue over changes made elsewhere. Completed action retries return the recorded result. If the server stopped between starting an action and recording its result, the receipt stays uncertain: automatic replay is refused rather than risking duplicate writes. This is conservative conflict handling, not automatic merging.

Use the small sync notice to download a private JSON backup, retry, or explicitly accept the online version after review. Accepting the online version discards ALL pending local changes after confirmation; preserve the backup first. Browser storage eviction, clearing site data, uninstalling, or using another browser profile can lose pending edits.

## Privacy and limits

The device copy is readable by anyone with access to that browser profile. Passwords, email-change credentials, OAuth authorization URLs, and refresh tokens are not saved in the queue. Sign out online after syncing to revoke the session and clear the saved copy. Do not sign in for offline use on a shared/untrusted profile.

The saved snapshot supports up to 5,000 stored task records, including history/tombstones, and 10,000 pending operations. A browser must support service workers, IndexedDB, Web Locks, secure contexts, and modern abort signals. It is not an encrypted vault or guaranteed backup. Multiple tabs serialize local changes; the backend retains its existing single-process account coordination model.

The service worker caches only anonymous public HTML/JavaScript/CSS/fonts, never API responses. Private snapshots/queues are written explicitly to IndexedDB. Legacy task-only queues from the previous implementation are preserved and must finish syncing before new-format actions can be added.
