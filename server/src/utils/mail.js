import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { AppError } from "./errors.js";
export const createResetMailer = (env, production) =>
  createAccountMailer(env, production, "reset");
export const createVerificationMailer = (env, production) =>
  createAccountMailer(env, production, "verification");
function createAccountMailer(env, production, kind) {
  const subject =
    kind === "verification"
      ? "Verify your Planora email"
      : "Reset your Planora password";
  const textFor = (url) =>
    kind === "verification"
      ? `Use this link within 24 hours to verify your current Planora email:\n${url}\n\nIf you did not request this, ignore this message.`
      : `Use this link within 15 minutes to reset your Planora password:\n${url}\n\nIf you did not request this, ignore this message.`;
  const mode = env.MAIL_MODE || (production ? "smtp" : "file");
  if (mode === "smtp2go") {
    if (!env.SMTP2GO_API_KEY?.trim() || !env.MAIL_FROM?.trim()) return null;
    return async ({ to, url }) => {
      try {
        const response = await fetch("https://api.smtp2go.com/v3/email/send", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            "X-Smtp2go-Api-Key": env.SMTP2GO_API_KEY.trim(),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ sender: env.MAIL_FROM.trim(), to: [to], subject, text_body: textFor(url) }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error("Provider rejected delivery");
        }
        const result = await response.json();
        // HTTP success alone does not establish acceptance by this provider.
        if (result?.data?.succeeded !== 1 || result?.data?.failed !== 0)
          throw new Error("Provider did not accept the recipient");
      } catch {
        throw new AppError(503, "Email delivery could not be completed.", "MAIL_DELIVERY_FAILED");
      }
    };
  }
  // HTTPS delivery works on hosts that block outbound SMTP ports.
  if (mode === "resend") {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) return null;
    return async ({ to, url }) => {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `planora-${kind}-${createHash("sha256").update(JSON.stringify([to, url])).digest("hex")}`,
          },
          body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text: textFor(url) }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error("Provider rejected delivery");
        }
        await response.body?.cancel();
      } catch {
        // Never return provider bodies, API credentials, or recovery URLs.
        throw new AppError(503, "Email delivery could not be completed.", "MAIL_DELIVERY_FAILED");
      }
    };
  }
  if (mode === "file" && !production) {
    const directory = fileURLToPath(
      new URL("../../.dev-mail/", import.meta.url),
    );
    return async ({ to, url }) => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const text = `To: ${to}\nSubject: ${subject}\n\n${textFor(url)}\n`;
      await writeFile(
        join(directory, `${Date.now()}-${randomUUID()}.txt`),
        text,
        { mode: 0o600 },
      );
      console.log(
        `${kind === "verification" ? "Email verification" : "Password recovery"} preview created. Run npm run mail:latest to view it locally.`,
      );
    };
  }
  if (
    mode !== "smtp" ||
    !env.SMTP_HOST ||
    !env.SMTP_USER ||
    !env.SMTP_PASS ||
    !env.MAIL_FROM
  )
    return null;
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new AppError(500, "Invalid SMTP port.");
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return async ({ to, url }) => {
    await transport.sendMail({
      from: env.MAIL_FROM,
      to,
      subject,
      text: textFor(url),
    });
  };
}
