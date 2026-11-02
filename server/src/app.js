import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import taskRoutes from "./routes/tasks.js";
import accountRoutes from "./routes/account.js";
import { seriesRoutes, templateRoutes } from "./routes/planning.js";
import insightsRoutes from "./routes/insights.js";
import exportRoutes from "./routes/exports.js";
import googleRoutes from "./routes/google.js";
import adminRoutes from "./routes/admin.js";
import reminderRoutes from "./routes/reminders.js";
import { siteSettings } from "./utils/site.js";
import { AppError, errorHandler } from "./utils/errors.js";
export function createApp(config) {
  const app = express();
  app.locals.config = config;
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "32kb" }), cookieParser());
  // Cookie authentication needs origin protection for state-changing requests.
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        req.headers.origin !== config.appOrigin ||
        req.headers["x-planora-client"] !== "web"
      )
        throw new AppError(
          403,
          "Request origin is not permitted.",
          "ORIGIN_REJECTED",
        );
    }
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMIT",
          message: "Too many requests. Try again shortly.",
        },
      },
    }),
  );
  app.get("/api/health", (req, res) =>
    res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({
      status: mongoose.connection.readyState === 1 ? "ok" : "unavailable",
      application: "Planora",
    }),
  );
  app.get("/api/public/settings", async (req, res) => {
    const site = await siteSettings();
    res.json({
      registrationOpen: site.registrationOpen,
      defaultTimeZone: site.defaultTimeZone,
      browserRemindersAllowed: site.browserRemindersAllowed,
    });
  });
  app.use("/api/auth", authRoutes());
  app.use("/api/tasks", taskRoutes);
  app.use("/api/account", accountRoutes);
  app.use("/api/series", seriesRoutes);
  app.use("/api/templates", templateRoutes);
  app.use("/api/insights", insightsRoutes);
  app.use("/api/exports", exportRoutes);
  app.use("/api/google", googleRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/reminders", reminderRoutes);
  app.use("/api", (req, res, next) =>
    next(new AppError(404, "API route not found.")),
  );
  const dist = fileURLToPath(new URL("../../client/dist/", import.meta.url));
  // app.js lives in server/src; ../../ reaches the project root.
  if (config.production && existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*path}", (req, res) => res.sendFile(`${dist}/index.html`));
  }
  app.use((req, res, next) => next(new AppError(404, "Route not found.")));
  app.use(errorHandler);
  return app;
}
