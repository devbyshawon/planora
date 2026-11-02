# Upgrade your running Planora to Stage 2

Version **0.2.0** adds profile editing, password changes/recovery, account-saved preferences, and personal custom categories.

## Apply the update to your existing Mac project

1. Stop the running app with **Control+C** in its terminal.
2. Extract `Planora_Stage2_Update.zip`. It contains `Planora_Stage2_Update/apply-stage2.mjs`, a verification manifest, and a full `planora` source folder.
3. Keep your existing `planora` folder open in VS Code. Open its terminal and run the installer against that folder.

If you extracted the download into Downloads, this is the command **from your existing project root**:

```bash
node ~/Downloads/Planora_Stage2_Update/apply-stage2.mjs .
```

If the extracted folder is elsewhere, change only the script path. The final `.` means your current project folder.

The installer verifies the bundled source, checks your files against Stage 1, and backs up changed source files under `.planora-backups/`. It preserves `server/.env`, ignores installed dependencies, and does not access your database. If it detects source edits, it lists them and stops before making changes so they can be merged.

Then run:

```bash
npm ci
npm test
npm run build
npm run dev
```

Open **http://localhost:5173** and sign in using your existing account. You do not need to register again. Existing account defaults are added automatically; task IDs, categories, notes, dates, and bucket history are preserved.

The previous browser-only dark/clock preferences are replaced by account preferences. Existing accounts initially receive light mode, 12-hour time, Monday-first weeks, hour guides, and Week as the default view; choose your preferences in Settings.

## 1. Profile

Use the **settings gear** in the top bar, then **Profile**.

- Edit your name and email address.
- Changing an email requires your current password and signs out other sessions.
- Existing password recovery links are revoked after an email change.
- Email verification is not included in this stage.

## 2. Password changes

Open **Settings → Security**. Enter your current password, a new password, and confirmation.

The current browser stays signed in. Other sessions and recovery links are revoked. Passwords need at least 8 characters and at most 72 UTF-8 bytes. Non-ASCII characters can use more than one byte.

## 3. Password recovery: test locally

Local development defaults to **file preview mode** when `MAIL_MODE` is absent from your existing `.env`. You can also add this explicit setting:

```dotenv
MAIL_MODE=file
```

1. Sign out.
2. Click **Forgot password?** on the sign-in screen.
3. Enter the email of an account you registered in Planora.
4. Click **Send reset link**.
5. In a second terminal, at your project root, run:

```bash
npm run mail:latest
```

6. Copy the displayed reset link into your browser.
7. Enter and confirm your new password, then sign in with it.

File mode writes a private preview to `server/.dev-mail/`; it does **not** send an email. This folder is ignored by Git. Do not share its contents. Links expire in 15 minutes, are single-use, and have only a SHA-256 hash stored in MongoDB. The request screen deliberately gives the same message for existing and unknown account emails. Repeated requests for the same account are limited to one email per minute.

If you request another email after that cooldown, its link replaces the previous link. Password changes, email changes, and successful resets invalidate old recovery links. Resetting a password signs out all previous sessions and requires a fresh sign-in.

The reset token uses the URL fragment and is removed from the address bar after the app reads it. A reset page should stay open until completed; refreshing after the fragment is removed requires reopening the original email link.

## 4. Enable real email delivery

Append these settings to **your existing** `server/.env`, using the credentials and sender permitted by your SMTP provider:

```dotenv
MAIL_MODE=smtp
SMTP_HOST=your-provider-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
MAIL_FROM=your-verified-sender@example.com
```

Restart the backend after environment changes. Port 465 uses implicit TLS; port 587 requires STARTTLS. The application does not disable certificate validation. Set `APP_ORIGIN` to the app's actual URL so recovery links open the right site.

No SMTP account is bundled. Live delivery depends on your provider's credentials and sender policy. This release tests local previews and the reset workflow; delivery through your own email provider must be checked after configuration.

File preview mode is disabled in production. A production server without valid mail configuration returns `MAIL_NOT_CONFIGURED` for recovery requests. Production setup remains a later project stage.

Official transport instructions: [Nodemailer SMTP](https://nodemailer.com/smtp).

## 5. Account preferences

Open **Settings → Preferences** to save:

- Light/dark appearance.
- 12/24-hour time format.
- Monday/Sunday as the first day of the week.
- Default Day/Week/Month view.
- Hour guides.
- Reminder lead time, stored for the later reminder implementation.
- Planner timezone.

Theme, clock, and guide controls in the existing planner also save to your account. Other devices load these settings when they sign in or reload. Notification delivery is not active in Stage 2.

### Timezone changes

This release uses one explicit policy: **keep every calendar task's local date and clock time** and recalculate its UTC instants for the new timezone. For example, 09:15 remains 09:15. Completion timestamps and bucket history remain unchanged. This applies to past and future calendar entries, so confirm the policy in the form before saving.

All calendar task updates and the account timezone are committed in one MongoDB transaction. If any task would have a nonexistent or ambiguous daylight-saving time, the entire update is rejected and no task/timezone/preference changes from that request are saved. Adjust the conflicting task first.

**MongoDB Atlas supports this workflow.** A local standalone MongoDB server can use the other Stage 2 features, but changing timezone requires running it as a replica set.

## 6. Custom categories

Open **Settings → Categories**.

- Add, rename, recolour, and delete personal categories.
- Your existing four categories retain their original IDs.
- New categories appear in task forms, sidebar filters, calendar blocks, and bucket cards.
- Renaming or recolouring does not rewrite task IDs or remove tasks.
- A category used by any scheduled or bucket task cannot be deleted. Reassign those tasks first.
- Keep at least one category. Each account supports up to 50 categories.

## Verify your update

- Your existing account still signs in and its tasks are present.
- Profile changes appear in the header.
- A new category can be selected when creating a task.
- Preferences survive refresh and another sign-in.
- Sunday-first weeks change both Week and Month layouts.
- A password change rejects the old password on the next sign-in.
- The local recovery link resets the password once and then becomes invalid.
- `npm test` passes **17 tests** and `npm run build` succeeds.

## Next stage

Recurring tasks, task templates, and global search are next. See ROADMAP.md for the complete remaining proposal work.
