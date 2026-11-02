# Offline account tasks

Offline planner is a separate lightweight workspace for the same account's tasks, not a second account or an independent task database. The usual calendar remains the online interface.

## First use

1. Wait for deployment, then accept the PWA update or close every Planora window and reopen while online. The current service worker must install its offline shell successfully.
2. Sign in, open **Offline planner**, and select **Save my tasks for offline use** on a trusted device. Accept the readable-device-copy notice.
3. Check that the correct account and snapshot time appear. Keep this workspace open while editing offline.
4. Create, edit, complete, move to/from bucket, or delete saved tasks. Writes commit to IndexedDB before the interface reports a save. A pending count distinguishes local work from synced work.
5. Reconnect. Automatic sync runs on the online event, after saves, at startup, and every minute while the workspace is open and no editor is open. **Sync now** retries immediately. A sleeping backend or expired session can delay it; sign in to the same account when needed.
6. Download a JSON backup before clearing browser storage or removing the device copy. Verify zero pending changes before relying on the server copy.

## Boundaries

- Snapshots contain up to 5,000 active saved tasks. Recurring occurrences are materialized from 30 days before to 90 days after the snapshot date. Existing saved occurrences outside that window can also appear, but future rules do not expand while offline.
- Offline editing affects individual tasks/occurrences only. Recurrence rules, templates, reviews/progress, Google synchronization, account changes, server exports, and browser reminder delivery use the online interface.
- Changes sync to Planora, not directly to Google. Run the existing Google sync after reconnection if desired.
- Sync checks categories, timezone, task versions, ownership, deleted tasks, schedule validity, and overlaps. Allow overlaps explicitly only when intended. Timezone/DST validity is authoritative on the server; a locally saved schedule can require correction before it can sync.
- No closed-app background synchronization or reminder guarantee. Reopen the offline workspace to sync.
- Current browsers must support service workers, IndexedDB, Web Locks, and secure contexts (HTTPS or localhost). Private browsing/storage eviction can remove local data.

## Conflicts and backups

The first pending edit records the last server version. Later edits refer to earlier operation receipts. If another view/device changed the same task, sync stops at that operation and preserves the local queue. It does not choose a winning version automatically. Later queued operations wait.

Download a backup. Inspect the current task online. To accept the server version, use **Resolve a sync conflict → Discard pending edits and reload server copy**, which discards all remaining device edits only after confirmation. To keep an offline change, preserve it in the backup and reapply it to the refreshed version. Do not discard without a backup if you need other pending edits.

Restore JSON backups from the details panel, including on a new device. Restoring replaces the device copy after confirmation and pauses automatic sync until **Sync now**. Use only your own backups. Replaying an acknowledged operation is idempotent; a reused operation ID with changed content is rejected. Account checks prevent a backup from syncing into a different signed-in account.

## Privacy and integrity

This is opt-in readable local storage, not end-to-end encryption or an offline password vault. Signing out of the website does not delete the device copy. Anyone using that browser profile can open it. **Remove device copy** deletes the IndexedDB workspace and queued changes, after confirmation; it does not delete server tasks. Backups contain private data.

The worker caches public shell files/code only. API responses never enter Cache Storage. The application explicitly writes the opted-in snapshot to IndexedDB. Web Locks serialize device saves/syncs across tabs. MongoDB transactions atomically commit each task change and its operation receipt so retries after a lost response cannot create duplicates. This retains the existing single-process server coordination model; multi-instance deployment requires further review.
