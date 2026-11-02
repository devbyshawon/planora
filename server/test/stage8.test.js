import test from "node:test";
import assert from "node:assert/strict";
import { runtimeEnvironment } from "../src/utils/environment.js";
import { createResetMailer, createVerificationMailer } from "../src/utils/mail.js";
const base = { MONGODB_URI: "mongodb://127.0.0.1/test", JWT_SECRET: "a".repeat(48) };

test("runtime settings validate exact origins, HTTPS production, ports, and trusted proxy counts", () => {
  assert.equal(runtimeEnvironment(base).appOrigin, "http://localhost:5173");
  const valid = runtimeEnvironment({ ...base, NODE_ENV: "production", APP_ORIGIN: "https://planora.example", TRUST_PROXY: "1", PORT: "10000", MAIL_MODE: "resend" });
  assert.equal(valid.port, 10000); assert.equal(valid.trustProxy, 1); assert.equal(valid.production, true);
  for (const values of [{ APP_ORIGIN: "https://site.test/" }, { APP_ORIGIN: "https://site.test/path" }, { APP_ORIGIN: "https://user:pass@site.test" }, { APP_ORIGIN: "file:///test" }, { APP_ORIGIN: "invalid" }, { PORT: "0" }, { PORT: "1.5" }, { PORT: "65536" }, { TRUST_PROXY: "true" }, { TRUST_PROXY: "-1" }])
    assert.throws(() => runtimeEnvironment({ ...base, ...values }));
});
test("production rejects HTTP, weak secrets, and local email previews without echoing private configuration", () => {
  for (const values of [{ NODE_ENV: "production" }, { JWT_SECRET: "short-private-value" }, { MONGODB_URI: "" }, { MAIL_MODE: "invalid" }, { NODE_ENV: "production", APP_ORIGIN: "https://site.test", MAIL_MODE: "file" }]) {
    assert.throws(() => runtimeEnvironment({ ...base, ...values }), error => !error.message.includes(base.JWT_SECRET) && !error.message.includes(base.MONGODB_URI));
  }
});
test("HTTPS email is optional and incomplete settings cannot expose local production previews", () => {
  assert.equal(createResetMailer({ MAIL_MODE: "resend" }, true), null);
  assert.equal(createVerificationMailer({ MAIL_MODE: "resend", RESEND_API_KEY: "test" }, true), null);
  assert.equal(createResetMailer({ MAIL_MODE: "file" }, true), null);
});
test("HTTPS mail sends only the intended account email with bounded fixed-provider requests and stable idempotency", async () => {
  const oldFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); return new Response("{}", { status: 200 }); };
  try {
    const env = { MAIL_MODE: "resend", RESEND_API_KEY: "private-test-key", MAIL_FROM: "Planora <account@example.com>" };
    const send = createResetMailer(env, true), message = { to: "owner@example.com", url: "https://site.test/#reset-password=private-token" };
    await send(message); await send(message); await createVerificationMailer(env, true)({ ...message, url: "https://site.test/#verify-email=other-token" });
    assert.equal(calls.length, 3); assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(calls[0].redirect, "error"); assert.ok(calls[0].signal instanceof AbortSignal);
    assert.equal(calls[0].headers.Authorization, "Bearer private-test-key");
    assert.deepEqual(JSON.parse(calls[0].body).to, [message.to]);
    assert.match(JSON.parse(calls[0].body).text, /15 minutes/);
    assert.match(JSON.parse(calls[2].body).text, /24 hours/);
    assert.equal(calls[0].headers["Idempotency-Key"], calls[1].headers["Idempotency-Key"]);
    assert.notEqual(calls[0].headers["Idempotency-Key"], calls[2].headers["Idempotency-Key"]);
    assert.ok(!calls[0].headers["Idempotency-Key"].includes("private-token"));
  } finally { globalThis.fetch = oldFetch; }
});
test("HTTPS delivery errors hide provider responses, tokens, and credentials", async () => {
  const oldFetch = globalThis.fetch;
  try {
    const send = createResetMailer({ MAIL_MODE: "resend", RESEND_API_KEY: "secret-key", MAIL_FROM: "account@example.com" }, true);
    for (const failure of [async () => new Response("SECRET_PROVIDER_BODY", { status: 403 }), async () => { throw new Error("SECRET_NETWORK_FAILURE secret-key"); }]) {
      globalThis.fetch = failure;
      await assert.rejects(send({ to: "owner@example.com", url: "https://site.test/#reset-password=SECRET_TOKEN" }), error => error.code === "MAIL_DELIVERY_FAILED" && !/SECRET|secret-key/.test(error.message));
    }
  } finally { globalThis.fetch = oldFetch; }
});
