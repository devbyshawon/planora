import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const destination = fileURLToPath(new URL("../server/.env", import.meta.url));
if (existsSync(destination)) {
  console.log("server/.env already exists; your settings were preserved.");
} else {
  const example = readFileSync(
    new URL("../server/.env.example", import.meta.url),
    "utf8",
  );
  writeFileSync(
    destination,
    example.replace(
      "REPLACE_WITH_A_RANDOM_SECRET",
      randomBytes(48).toString("hex"),
    ),
    { mode: 0o600 },
  );
  console.log(
    "Created server/.env with a random JWT secret. Set MONGODB_URI before starting.",
  );
}
