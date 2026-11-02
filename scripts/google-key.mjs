import { randomBytes } from "node:crypto";
console.log(
  "Copy this value into GOOGLE_TOKEN_KEY in server/.env. Keep it private and retain it across upgrades:",
);
console.log(randomBytes(32).toString("hex"));
