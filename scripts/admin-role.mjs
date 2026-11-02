import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { changeAdminRole } from "../server/src/utils/adminRole.js";
const [action, flag, email, ...extra] = process.argv.slice(2);
if (
  !["grant", "revoke"].includes(action) ||
  flag !== "--email" ||
  !email ||
  extra.length
) {
  console.error(
    "Use npm run admin:grant -- --email existing-account@example.com (or admin:revoke).",
  );
  process.exit(1);
}
dotenv.config({
  path: fileURLToPath(new URL("../server/.env", import.meta.url)),
  quiet: true,
});
if (!process.env.MONGODB_URI) {
  console.error("Set MONGODB_URI in server/.env first.");
  process.exit(1);
}
try {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const result = await changeAdminRole(
    email,
    action === "grant" ? "admin" : "user",
  );
  console.log(
    `${result.changed ? "Updated" : "Already set"}: ${result.email} has role ${result.role}. Sign in again to use the updated role.`,
  );
} catch (error) {
  console.error(
    error.status
      ? error.message
      : "Administrator setup failed. Check MongoDB access and that Atlas/a replica set is available.",
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
