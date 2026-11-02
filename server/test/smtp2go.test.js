import test from "node:test";
import assert from "node:assert/strict";
import { createResetMailer, createVerificationMailer } from "../src/utils/mail.js";
import { runtimeEnvironment } from "../src/utils/environment.js";

const env = { MAIL_MODE: "smtp2go", SMTP2GO_API_KEY: "private-test-key", MAIL_FROM: "Planora <sender@example.com>" };
const message = { to: "recipient@example.net", url: "https://planora.example/#reset-password=private-token" };

test("SMTP2GO supports production settings and requires explicit sender credentials", () => {
  assert.ok(runtimeEnvironment({ ...env, MONGODB_URI: "mongodb://localhost/test", JWT_SECRET: "x".repeat(48), NODE_ENV: "production", APP_ORIGIN: "https://planora.example" }).production);
  assert.equal(createResetMailer({ MAIL_MODE: "smtp2go" }, true), null);
  assert.equal(createResetMailer({ ...env, MAIL_FROM: " " }, true), null);
  assert.equal(createResetMailer({ ...env, SMTP2GO_API_KEY: " " }, true), null);
});

test("SMTP2GO uses HTTPS and verifies recipient acceptance for reset and verification", async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return Response.json({ data: { succeeded: 1, failed: 0 } });
  };
  try {
    await createResetMailer(env, true)(message);
    await createVerificationMailer(env, true)(message);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://api.smtp2go.com/v3/email/send");
    assert.equal(calls[0].redirect, "error");
    assert.ok(calls[0].signal instanceof AbortSignal);
    assert.equal(calls[0].headers["X-Smtp2go-Api-Key"], env.SMTP2GO_API_KEY);
    const body = JSON.parse(calls[0].body);
    assert.deepEqual(body.to, [message.to]);
    assert.equal(body.sender, env.MAIL_FROM);
    assert.match(body.text_body, /15 minutes/);
    assert.match(JSON.parse(calls[1].body).text_body, /24 hours/);
    assert.ok(!calls[0].body.includes(env.SMTP2GO_API_KEY));
  } finally { globalThis.fetch = original; }
});

test("SMTP2GO rejects partial/provider failures and hides secrets without retrying", async () => {
  const original = globalThis.fetch;
  try {
    for (const reply of [
      () => new Response("private-provider-body", { status: 429 }),
      () => Response.json({ data: { succeeded: 0, failed: 1, failures: ["private-provider-body"] } }),
      () => Response.json({ data: { succeeded: 1, failed: 1 } }),
      () => Response.json({}),
      () => new Response("invalid-json"),
      () => { throw new Error("private-test-key private-token"); },
    ]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return reply(); };
      await assert.rejects(createResetMailer(env, true)(message), error => error.code === "MAIL_DELIVERY_FAILED" && !/private|token|provider-body/.test(error.message));
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = original; }
});
