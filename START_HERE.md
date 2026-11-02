# Start Planora on your Mac

This guide covers a fresh installation of the current source. If you already run Stage 1, follow UPGRADE_STAGE2.md first. If you already run Stage 3, follow UPGRADE_STAGE4.md. If you already run Stage 4, follow UPGRADE_STAGE5.md. If you already run Stage 5, follow UPGRADE_STAGE6.md. For older versions, apply the earlier updates in order.

## 1. Extract and open the project

Download the ZIP, double-click it in Finder, and open the extracted `planora` folder in VS Code: **File → Open Folder**.

Open **Terminal → New Terminal** in VS Code. Make sure the terminal is inside `planora`, where the root `package.json` is located.

```bash
pwd
ls
```

You should see `client`, `server`, `shared`, `scripts`, and `package.json`.

## 2. Check Node.js and npm

```bash
node -v
npm -v
```

Use **Node.js 24** for this package. If you already use nvm:

```bash
nvm install
nvm use
```

Otherwise install Node.js 24 from [nodejs.org](https://nodejs.org/en/download), restart the VS Code terminal, and run the version commands again. You do not need to install React, Express, or Vite globally.

## 3. Install dependencies

From the root `planora` folder:

```bash
npm ci
npm run setup
```

`npm ci` installs both the client and server dependencies. Setup creates `server/.env` and generates a random JWT secret for you. It does not change an existing `.env` file.

## 4. Connect MongoDB Atlas

If you want to use an existing Atlas project, create a separate database name for Planora in its connection string. There is no need to create another Atlas account.

1. Open [MongoDB Atlas](https://cloud.mongodb.com/).
2. Create or select a cluster appropriate for your account.
3. Create a **database user** with read/write access for the Planora database. This is separate from the account you use to sign into Atlas.
4. Add your current public IP to the project's IP access list. Update it if your internet connection changes.
5. Open the cluster's connection flow for **Drivers / Node.js** and copy the connection string.
6. Replace its username and password placeholders with your database-user credentials, and use `planora` as the database name before the query string.

Open `server/.env` in VS Code. Update only `MONGODB_URI`:

```dotenv
NODE_ENV=development
PORT=5001
MONGODB_URI=mongodb+srv://YOUR_DATABASE_USER:YOUR_ENCODED_PASSWORD@YOUR_CLUSTER_HOST/planora?retryWrites=true&w=majority
JWT_SECRET=KEEP_THE_RANDOM_VALUE_GENERATED_BY_SETUP
APP_ORIGIN=http://localhost:5173
TRUST_PROXY=0
```

Use your actual cluster hostname. Keep the generated JWT secret, not the explanatory text shown above. If your database password contains special characters such as `@`, `/`, or `:`, percent-encode them in the connection URI. Do not paste credentials into the frontend or send your `.env` file to anyone.

MongoDB creates the `planora` database and collections when the first data is written. You do not have to create every collection manually.

Official instructions: [Connect to an Atlas cluster](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).

## 5. Start both parts

```bash
npm run dev
```

Wait for the API's **Planora API ready** message and Vite's **Local** URL. Open:

**http://localhost:5173**

Use `localhost`, not `127.0.0.1`, in the browser because `APP_ORIGIN` is configured for `localhost`. Keep this terminal running. Stop both processes with **Control+C**.

The two processes are:

| Part     | Address                 | Job                             |
| -------- | ----------------------- | ------------------------------- |
| Frontend | `http://localhost:5173` | React interface                 |
| Backend  | `http://localhost:5001` | Authentication and database API |

Visit **http://localhost:5001/api/health** to check the backend. A healthy response contains `"status":"ok"`.

## 6. Create your first account

Register with your name, email, password, and `Asia/Dhaka` timezone. The email is an account identifier; this starter does not send email or verify addresses yet.

Your account signs in automatically after registration. Refresh the page to confirm your cookie session persists.

## 7. Try the core workflow

1. Click **Create task**.
2. Title: **CascadeVLM — Paper Reading**.
3. Date: choose today.
4. Start: **09:15**. End: **09:55**.
5. Category: **Study**. Priority: **High**.
6. Create the task, then inspect its exact block in Day or Week view.
7. Create another task at **09:30–10:00**. Confirm the overlap warning appears. Choose **Save anyway** to see the blocks side by side.
8. Open the first task. Set its status to **Completed** and save. Reopen it and set it back to **Scheduled** if needed.
9. Open a task, click **Bucket list**, then **Save changes**. It should leave the calendar and appear in the bucket list.
10. Open that bucket item, click **Schedule**, choose a new date/time, and save. It should return to the calendar with its notes and postponement count retained.
11. Test Month view, category filters, search, and dark mode.
12. Sign out. Register another account and confirm the first account's tasks are not visible.

## 8. Run checks

In another terminal at the project root:

```bash
npm test
npm run build
```

The first automated test run downloads a disposable MongoDB binary. Tests do not use your real Atlas database. The production build goes into `client/dist`.

## Common startup problems

| Message / symptom                       | What to check                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `node: command not found`               | Install Node.js, then reopen the terminal                                                           |
| Unsupported engine / Vite startup error | Switch to Node.js 24                                                                                |
| `npm ci` cannot find package.json       | Change into the root `planora` folder                                                               |
| Database connection failed              | Atlas database username/password, IP allowlist, and URI hostname                                    |
| `ECONNREFUSED 127.0.0.1:27017`          | The sample URI still targets local MongoDB; replace it with Atlas if you do not run MongoDB locally |
| API unavailable in browser              | Wait for the backend readiness message; check the API terminal output                               |
| Request origin is not permitted         | Open `http://localhost:5173`; check `APP_ORIGIN` and restart the backend after edits                |
| Port 5173 already in use                | Stop the other Vite process, then rerun `npm run dev`                                               |
| Port 5001 already in use                | Stop the old backend; if changing ports, also update the proxy in `client/vite.config.js`           |
| Too many attempts                       | Wait for the rate-limit window before retrying                                                      |

## What to learn first

Read files in this order while running the app:

1. `server/src/index.js`: environment, database, server startup.
2. `server/src/app.js`: middleware and route mounting.
3. `server/src/models/User.js` and `Task.js`: stored data.
4. `server/src/routes/auth.js` → `controllers/authController.js`: account workflow.
5. `server/src/routes/tasks.js` → `controllers/taskController.js`: task workflow.
6. `shared/calendar.js`: time validation and exact calendar placement.
7. `client/src/api.js`: frontend requests.
8. `client/src/App.jsx` and `components/`: how the interface uses the API.

The current release includes profile/security settings and custom categories. Open the top-bar gear to explore them. See UPGRADE_STAGE2.md for password recovery previews and the new acceptance checks. The sidebar now also provides daily review and progress. See UPGRADE_STAGE4.md for history, exact metrics, and drag-and-drop.


Google Calendar is optional. Leave all four GOOGLE_* settings blank until you follow UPGRADE_STAGE6.md. Existing planner features do not require Google credentials.
