import { readdir, readFile } from "node:fs/promises";
const directory = new URL("../server/.dev-mail/", import.meta.url);
try {
  const files = (await readdir(directory))
    .filter((name) => name.endsWith(".txt"))
    .sort();
  if (!files.length) throw new Error();
  console.log(await readFile(new URL(files.at(-1), directory), "utf8"));
} catch {
  console.log(
    "No local recovery email yet. Submit Forgot password for a registered account while MAIL_MODE=file.",
  );
}
