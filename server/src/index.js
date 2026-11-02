import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createResetMailer, createVerificationMailer } from "./utils/mail.js";
import Task from "./models/Task.js";
import Template from "./models/Template.js";
import RecurrenceSeries from "./models/RecurrenceSeries.js";
import GoogleConnection from "./models/GoogleConnection.js";
import GoogleOAuthState from "./models/GoogleOAuthState.js";
import GoogleEvent from "./models/GoogleEvent.js";
import GoogleSyncRun from "./models/GoogleSyncRun.js";
import { googleConfig } from "./utils/google/config.js";
import SiteSettings from "./models/SiteSettings.js";
import ReminderDelivery from "./models/ReminderDelivery.js";
import AdminAudit from "./models/AdminAudit.js";
import { runtimeEnvironment } from "./utils/environment.js";
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
let google, runtime;
try {
  runtime = runtimeEnvironment(process.env);
  google = googleConfig(process.env, runtime.appOrigin);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
let httpServer;
try {
  await mongoose.connect(runtime.mongoUri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all([
    Task.init(),
    Template.init(),
    RecurrenceSeries.init(),
    GoogleConnection.init(),
    GoogleOAuthState.init(),
    GoogleEvent.init(),
    GoogleSyncRun.init(),
    SiteSettings.init(),
    ReminderDelivery.init(),
    AdminAudit.init(),
  ]);
  const app = createApp({
    jwtSecret: runtime.jwtSecret,
    google,
    appOrigin: runtime.appOrigin,
    production: runtime.production,
    trustProxy: runtime.trustProxy,
    sendResetMail: createResetMailer(process.env, runtime.production),
    sendVerificationMail: createVerificationMailer(
      process.env,
      runtime.production,
    ),
  });
  httpServer = app.listen(runtime.port, () =>
    console.log(`Planora API ready at http://localhost:${runtime.port}`),
  );
} catch (err) {
  // Do not print a connection URI, which can contain the database password.
  console.error(
    `Database connection failed (${err.name}). Check MONGODB_URI, credentials, and MongoDB network access.`,
  );
  process.exit(1);
}
async function shutdown() {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  await mongoose.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
