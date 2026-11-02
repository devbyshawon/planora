import { Router } from "express";
import { body } from "express-validator";
import { rateLimit } from "express-rate-limit";
import {
  register,
  login,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";
import { requireAuth, safeUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  requestVerification,
  verifyEmail,
} from "../controllers/verificationController.js";
export default function authRoutes() {
  const router = Router();
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMIT",
        message: "Too many attempts. Try again in 15 minutes.",
      },
    },
  });
  const credentials = [
    body("email")
      .isString()
      .bail()
      .trim()
      .isEmail()
      .withMessage("Enter a valid email.")
      .isLength({ max: 254 })
      .toLowerCase(),
    body("password")
      .isString()
      .bail()
      .isLength({ min: 8, max: 128 })
      .withMessage("Password must contain 8–128 characters."),
  ];
  router.post(
    "/register",
    loginLimit,
    body("name")
      .isString()
      .bail()
      .trim()
      .isLength({ min: 1, max: 80 })
      .withMessage("Name must contain 1–80 characters."),
    ...credentials,
    body("timeZone").optional().isString(),
    validate,
    register,
  );
  router.post("/login", loginLimit, ...credentials, validate, login);
  router.get("/me", requireAuth, (req, res) =>
    res.json({ user: safeUser(req.user) }),
  );
  router.post("/logout", requireAuth, logout);
  const recoveryLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMIT",
        message: "Too many recovery attempts. Try again in 15 minutes.",
      },
    },
  });
  const newPassword = body("newPassword")
    .isString()
    .bail()
    .isLength({ min: 8, max: 72 })
    .withMessage("Use a password with 8–72 characters.");
  router.post(
    "/change-password",
    requireAuth,
    loginLimit,
    body("currentPassword").isString().isLength({ min: 1, max: 128 }),
    newPassword,
    validate,
    changePassword,
  );
  router.post(
    "/forgot-password",
    recoveryLimit,
    credentials[0],
    validate,
    forgotPassword,
  );
  router.post(
    "/reset-password",
    recoveryLimit,
    body("token")
      .isString()
      .bail()
      .matches(/^[a-f0-9]{64}$/)
      .withMessage("Invalid reset link."),
    newPassword,
    validate,
    resetPassword,
  );
  router.post(
    "/request-verification",
    requireAuth,
    recoveryLimit,
    requestVerification,
  );
  router.post("/verify-email", recoveryLimit, verifyEmail);
  return router;
}
