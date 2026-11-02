import { execFileSync } from "node:child_process";

// Check tracked paths only. Never read secrets or runtime email contents.
const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0").filter(Boolean);
const forbidden = paths.filter(path => {
  const parts = path.split("/");
  const name = parts.at(-1);
  return parts.some(part => [".dev-mail", ".planora-backups", "node_modules"].includes(part)) ||
    ((name === ".env" || name.startsWith(".env.")) && name !== ".env.example");
});
if (forbidden.length) {
  console.error("Repository privacy check failed. Untrack private/runtime files while preserving local copies:");
  forbidden.forEach(path => console.error(`- ${path}`));
  process.exitCode = 1;
} else {
  console.log("Repository privacy check passed (tracked paths only; file contents and Git history are not scanned).");
}
