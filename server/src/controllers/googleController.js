import mongoose from "mongoose";
import { randomBytes, createHash } from "node:crypto";
import Connection from "../models/GoogleConnection.js";
import OAuthState from "../models/GoogleOAuthState.js";
import GoogleEvent from "../models/GoogleEvent.js";
import SyncRun from "../models/GoogleSyncRun.js";
import Task from "../models/Task.js";
import {
  configured,
  GOOGLE_SCOPES,
  CALENDAR_SCOPE,
  digest,
  encryptSecret,
  decryptSecret,
} from "../utils/google/config.js";
import {
  googleRequest,
  formRequest,
  TOKEN_URL,
  USERINFO_URL,
  REVOKE_URL,
} from "../utils/google/client.js";
import { ensureCalendar, safeRun, syncItem } from "../utils/google/sync.js";
import { assertWindow, materializeRecurrences } from "../utils/recurrence.js";
import { AppError } from "../utils/errors.js";
const cookieName = "planora_google_oauth";
const cookieOptions = (app) => ({
  httpOnly: true,
  secure: app.locals.config.production,
  sameSite: "lax",
  path: "/api/google",
  maxAge: 10 * 60000,
});
const connected = async (req) => {
  configured(req.app);
  const connection = await Connection.findOne({
    owner: req.user._id,
    connected: true,
  }).select("+refreshToken");
  if (!connection)
    throw new AppError(
      409,
      "Connect Google Calendar first.",
      "GOOGLE_NOT_CONNECTED",
    );
  if (connection.needsReconnect)
    throw new AppError(
      409,
      "Google access expired or was revoked. Connect Google Calendar again.",
      "GOOGLE_RECONNECT",
    );
  return connection;
};
export async function googleStatus(req, res) {
  const connection = await Connection.findOne({ owner: req.user._id }).lean();
  const run = await SyncRun.findOne({ owner: req.user._id }).lean();
  res.json({
    configured: Boolean(req.app.locals.config.google),
    connected: Boolean(connection?.connected),
    needsReconnect: Boolean(connection?.needsReconnect),
    email: connection?.connected ? connection.email : null,
    calendarReady: Boolean(connection?.connected && connection.calendarId),
    calendarPending: Boolean(connection?.calendarPending),
    connectedAt: connection?.connectedAt,
    run: safeRun(run),
  });
}
export async function startGoogle(req, res) {
  const config = configured(req.app),
    state = randomBytes(32).toString("base64url"),
    browser = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  await OAuthState.findOneAndUpdate(
    { owner: req.user._id },
    {
      $set: {
        stateHash: digest(state),
        browserHash: digest(browser),
        verifier: encryptSecret(
          verifier,
          config.tokenKey,
          `pkce:${req.user._id}`,
        ),
        tokenVersion: req.user.tokenVersion,
        expiresAt: new Date(Date.now() + 10 * 60000),
      },
    },
    { upsert: true },
  );
  res.cookie(cookieName, browser, cookieOptions(req.app));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  res.json({ url: url.toString() });
}
export async function googleCallback(req, res) {
  const origin = req.app.locals.config.appOrigin;
  const redirect = (status) => res.redirect(303, `${origin}/?google=${status}`);
  try {
    const config = configured(req.app),
      { state, code, error } = req.query,
      browser = req.cookies[cookieName];
    if (
      typeof state !== "string" ||
      state.length > 200 ||
      typeof browser !== "string" ||
      browser.length > 200
    )
      return redirect("expired");
    const saved = await OAuthState.findOneAndDelete({
      owner: req.user._id,
      stateHash: digest(state),
      browserHash: digest(browser),
      tokenVersion: req.user.tokenVersion,
      expiresAt: { $gt: new Date() },
    }).select("+verifier");
    if (!saved) return redirect("expired");
    res.clearCookie(cookieName, {
      ...cookieOptions(req.app),
      maxAge: undefined,
    });
    if (error) return redirect("denied");
    if (typeof code !== "string" || !code || code.length > 4000)
      return redirect("failed");
    const tokens = await googleRequest(
      req.app,
      TOKEN_URL,
      formRequest({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code,
        code_verifier: decryptSecret(
          saved.verifier,
          config.tokenKey,
          `pkce:${req.user._id}`,
        ),
      }),
    );
    if (
      typeof tokens.access_token !== "string" ||
      !String(tokens.scope || "")
        .split(" ")
        .includes(CALENDAR_SCOPE)
    )
      return redirect("permission");
    const identity = await googleRequest(req.app, USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (
      typeof identity.sub !== "string" ||
      !identity.sub ||
      typeof identity.email !== "string" ||
      identity.email.length > 254 ||
      identity.email_verified !== true
    )
      return redirect("failed");
    let connection = await Connection.findOne({ owner: req.user._id }).select(
      "+refreshToken",
    );
    if (connection?.connected && connection.subject !== identity.sub)
      return redirect("account");
    const same = connection?.subject === identity.sub;
    if (
      !tokens.refresh_token &&
      !(same && connection?.connected && connection.refreshToken)
    )
      return redirect("refresh");
    if (!connection) connection = new Connection({ owner: req.user._id });
    if (!same) {
      connection.generation = randomBytes(16).toString("hex");
      connection.calendarId = undefined;
      connection.calendarPending = false;
      await SyncRun.updateOne(
        { owner: req.user._id },
        { $set: { status: "cancelled" } },
      );
    }
    connection.subject = identity.sub;
    connection.email = identity.email;
    connection.connected = true;
    connection.needsReconnect = false;
    connection.connectedAt = new Date();
    connection.disconnectedAt = undefined;
    if (tokens.refresh_token)
      connection.refreshToken = encryptSecret(
        tokens.refresh_token,
        config.tokenKey,
        `refresh:${req.user._id}`,
      );
    await connection.save();
    (req.app.locals.googleTokens ??= new Map()).set(
      `${connection.owner}:${connection.generation}`,
      {
        token: tokens.access_token,
        expiresAt:
          Date.now() + Math.min(3600, Number(tokens.expires_in) || 3600) * 1000,
      },
    );
    try {
      await ensureCalendar(req.app, connection, req.user.timeZone);
    } catch {
      return redirect("calendar");
    }
    return redirect("connected");
  } catch {
    return redirect("failed");
  }
}
export async function setupCalendar(req, res) {
  const connection = await connected(req);
  if (
    req.body?.confirmNew !== undefined &&
    typeof req.body.confirmNew !== "boolean"
  )
    throw new AppError(400, "Invalid calendar confirmation.");
  await ensureCalendar(req.app, connection, req.user.timeZone, {
    confirmNew: req.body?.confirmNew === true,
    adoptId: req.body?.calendarId,
  });
  res.json({ calendarReady: true });
}
export async function disconnectGoogle(req, res) {
  const connection = await Connection.findOne({ owner: req.user._id }).select(
    "+refreshToken",
  );
  let revoked = true;
  if (connection?.connected && connection.refreshToken) {
    if (!req.app.locals.config.google) revoked = false;
    else {
      try {
        const token = decryptSecret(
          connection.refreshToken,
          configured(req.app).tokenKey,
          `refresh:${req.user._id}`,
        );
        await googleRequest(req.app, REVOKE_URL, formRequest({ token }));
      } catch (error) {
        revoked = error.status === 400;
      }
    }
  }
  if (connection) {
    req.app.locals.googleTokens?.delete(
      `${connection.owner}:${connection.generation}`,
    );
    connection.refreshToken = undefined;
    connection.connected = false;
    connection.needsReconnect = false;
    connection.disconnectedAt = new Date();
    await connection.save();
  }
  await OAuthState.deleteMany({ owner: req.user._id });
  await SyncRun.updateOne(
    { owner: req.user._id },
    { $set: { status: "cancelled" } },
  );
  res.clearCookie(cookieName, { ...cookieOptions(req.app), maxAge: undefined });
  res.json({
    disconnected: true,
    revoked,
    message: revoked
      ? "Disconnected. Your Google calendar and existing events were kept."
      : "Disconnected locally. Google revocation could not be confirmed; remove Planora from your Google Account connections to finish revoking access. Existing events were kept.",
  });
}
function rangeInput(req) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AppError(400, "Choose a sync range.");
  assertWindow(body.from, body.to);
  const category = body.category ?? "";
  if (
    typeof category !== "string" ||
    (category && !req.user.categories.some((c) => c.id === category))
  )
    throw new AppError(400, "Choose one of your own categories.");
  return { from: body.from, to: body.to, category };
}
export async function startSync(req, res) {
  const connection = await connected(req),
    options = rangeInput(req);
  if (!connection.calendarId)
    throw new AppError(
      409,
      "Finish setting up the Planora calendar first.",
      "GOOGLE_CALENDAR_CHECK",
    );
  const existing = await SyncRun.findOne({ owner: req.user._id });
  if (existing?.status === "ready")
    throw new AppError(
      409,
      "Resume or cancel the current sync before starting another.",
      "GOOGLE_SYNC_ACTIVE",
    );
  const warnings = await materializeRecurrences(
    req.user,
    options.from,
    options.to,
  );
  const filter = {
    owner: req.user._id,
    location: "calendar",
    deletedAt: null,
    date: { $gte: options.from, $lte: options.to },
    ...(options.category ? { category: options.category } : {}),
  };
  const tasks = await Task.find(filter)
    .select("_id title")
    .sort({ date: 1, startMinute: 1, _id: 1 })
    .limit(5001)
    .lean();
  const mappings = await GoogleEvent.find({
    owner: req.user._id,
    generation: connection.generation,
    active: true,
    date: { $gte: options.from, $lte: options.to },
    ...(options.category ? { category: options.category } : {}),
  })
    .limit(5001)
    .lean();
  const items = [
    ...new Map([
      ...mappings.map((m) => [
        String(m.task),
        { task: m.task, title: m.title },
      ]),
      ...tasks.map((t) => [String(t._id), { task: t._id, title: t.title }]),
    ]).values(),
  ];
  if (items.length > 5000)
    throw new AppError(
      413,
      "This sync exceeds 5,000 task links. Choose a shorter range or category filter.",
      "GOOGLE_SYNC_TOO_LARGE",
    );
  await SyncRun.deleteOne({ owner: req.user._id });
  const run = await SyncRun.create({
    owner: req.user._id,
    generation: connection.generation,
    ...options,
    status: items.length ? "ready" : "complete",
    items,
    warningCount: warnings.length,
  });
  res.status(201).json({ run: safeRun(run), warnings: warnings.slice(0, 20) });
}
async function ownedRun(req) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError(404, "Sync not found.");
  const run = await SyncRun.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!run) throw new AppError(404, "Sync not found.");
  return run;
}
function pageNumber(query) {
  const value = query.page ?? "1";
  if (
    typeof value !== "string" ||
    !/^\d+$/.test(value) ||
    Number(value) < 1 ||
    Number(value) > 1000
  )
    throw new AppError(400, "Invalid results page.");
  return Number(value);
}
export async function syncResults(req, res) {
  res.json({ run: safeRun(await ownedRun(req), pageNumber(req.query)) });
}
export async function stepSync(req, res) {
  const connection = await connected(req),
    run = await ownedRun(req);
  if (run.generation !== connection.generation)
    throw new AppError(
      409,
      "The Google connection changed. Start a new sync.",
      "GOOGLE_CONNECTION_CHANGED",
    );
  if (run.status !== "ready") return res.json({ run: safeRun(run) });
  // A persisted lease also protects an uncertain HTTP request / process restart.
  const lease = await SyncRun.findOneAndUpdate(
    {
      _id: run._id,
      $or: [{ leaseUntil: null }, { leaseUntil: { $lt: new Date() } }],
    },
    { $set: { leaseUntil: new Date(Date.now() + 180000) } },
  );
  if (!lease)
    throw new AppError(
      409,
      "This sync step is still running. Wait a moment, then resume.",
      "GOOGLE_STEP_BUSY",
    );
  const index = run.items.findIndex((item) => item.status === "pending");
  try {
    if (index !== -1) {
      const item = run.items[index];
      item.attempts++;
      try {
        Object.assign(
          item,
          await syncItem(req.app, req.user, connection, item),
          { code: "" },
        );
      } catch (error) {
        if (error.code === "GOOGLE_KEY_CHANGED")
          await Connection.updateOne(
            { _id: connection._id },
            { $set: { needsReconnect: true } },
          );
        item.status = "failed";
        item.code = error.code || "GOOGLE_SYNC_ERROR";
        item.message =
          error instanceof AppError
            ? error.message
            : "This task could not be synced. Retry it.";
      }
    }
    if (!run.items.some((item) => item.status === "pending"))
      run.status = "complete";
    run.leaseUntil = undefined;
    run.markModified("leaseUntil");
    await run.save();
  } catch (error) {
    await SyncRun.updateOne({ _id: run._id }, { $unset: { leaseUntil: 1 } });
    throw error;
  }
  res.json({ run: safeRun(run) });
}
export async function retrySync(req, res) {
  const connection = await connected(req),
    run = await ownedRun(req);
  if (run.generation !== connection.generation)
    throw new AppError(409, "The connection changed. Start a new sync.");
  if (run.status === "cancelled")
    throw new AppError(409, "Start a new sync after cancellation.");
  for (const item of run.items)
    if (item.status === "failed") {
      item.status = "pending";
      item.code = "";
      item.message = "";
    }
  run.status = run.items.some((item) => item.status === "pending")
    ? "ready"
    : "complete";
  await run.save();
  res.json({ run: safeRun(run) });
}
export async function cancelSync(req, res) {
  const run = await ownedRun(req);
  run.status = "cancelled";
  await run.save();
  res.json({ run: safeRun(run) });
}
