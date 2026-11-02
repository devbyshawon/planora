import { randomBytes, createHash } from "node:crypto";
import User from "../models/User.js";
import { AppError } from "../utils/errors.js";
const hash = (token) => createHash("sha256").update(token).digest("hex");
export async function requestVerification(req, res) {
  if (req.user.emailVerifiedAt)
    return res.json({ message: "Your current email is already verified." });
  const send = req.app.locals.config.sendVerificationMail;
  if (!send)
    throw new AppError(
      503,
      "Email verification delivery is not configured.",
      "MAIL_NOT_CONFIGURED",
    );
  const now = new Date(),
    token = randomBytes(32).toString("hex"),
    tokenHash = hash(token);
  const user = await User.findOneAndUpdate(
    {
      _id: req.user._id,
      email: req.user.email,
      $or: [
        { verificationRequestedAt: { $exists: false } },
        { verificationRequestedAt: { $lt: new Date(now.getTime() - 60000) } },
      ],
    },
    {
      $set: {
        verificationTokenHash: tokenHash,
        verificationExpiresAt: new Date(now.getTime() + 24 * 3600000),
        verificationRequestedAt: now,
      },
    },
    { new: true },
  );
  if (!user) {
    res.set("Retry-After", "60");
    throw new AppError(
      429,
      "No new verification email was sent. Wait at least one minute after your last attempt, then try again. If your account email changed, reload Planora first.",
      "VERIFICATION_COOLDOWN",
    );
  }
  if (user) {
    const url = new URL(req.app.locals.config.appOrigin);
    url.hash = `verify-email=${token}`;
    try {
      await send({ to: user.email, url: url.toString() });
    } catch {
      await User.updateOne(
        { _id: user._id, verificationTokenHash: tokenHash },
        { $unset: { verificationTokenHash: 1, verificationExpiresAt: 1 } },
      );
      throw new AppError(
        503,
        "Verification email could not be sent. Try again later.",
        "MAIL_DELIVERY_FAILED",
      );
    }
  }
  res.json({
    message:
      "The email provider accepted your verification email. The link expires in 24 hours. Check your inbox and spam folder; delivery may take a few minutes.",
  });
}
export async function verifyEmail(req, res) {
  const token = req.body?.token;
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new AppError(
      400,
      "This verification link is invalid or expired.",
      "INVALID_VERIFICATION",
    );
  const user = await User.findOneAndUpdate(
    {
      verificationTokenHash: hash(token),
      verificationExpiresAt: { $gt: new Date() },
    },
    {
      $set: { emailVerifiedAt: new Date() },
      $unset: {
        verificationTokenHash: 1,
        verificationExpiresAt: 1,
        verificationRequestedAt: 1,
      },
    },
    { new: true },
  );
  if (!user)
    throw new AppError(
      400,
      "This verification link is invalid or expired.",
      "INVALID_VERIFICATION",
    );
  res.json({ message: "Your email is verified. You can return to Planora." });
}
