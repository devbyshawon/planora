import mongoose from "mongoose";
import User from "../models/User.js";
import SiteSettings from "../models/SiteSettings.js";
import AdminAudit from "../models/AdminAudit.js";
import { siteSettings } from "./site.js";
import { AppError } from "./errors.js";
export async function changeAdminRole(email, role) {
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !["user", "admin"].includes(role)
  )
    throw new AppError(400, "Use a valid existing account email and role.");
  await siteSettings();
  let result;
  await mongoose.connection.transaction(async (session) => {
    // Concurrent CLI role changes write the same guard document and retry.
    await SiteSettings.updateOne(
      { _id: "site" },
      { $inc: { adminRevision: 1 } },
      { session },
    );
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).session(session);
    if (!user)
      throw new AppError(404, "Register this account in Planora first.");
    if (user.status === "suspended")
      throw new AppError(
        409,
        "Reactivate the account before changing its administrator role.",
      );
    if ((user.role || "user") === role) {
      result = { changed: false, email: user.email, role };
      return;
    }
    if (
      user.role === "admin" &&
      role === "user" &&
      (await User.countDocuments({
        role: "admin",
        status: { $ne: "suspended" },
      }).session(session)) <= 1
    )
      throw new AppError(409, "Keep at least one active administrator.");
    const before = user.role || "user";
    user.role = role;
    user.tokenVersion++;
    await user.save({ session });
    await AdminAudit.create(
      [
        {
          target: user._id,
          action: "local_admin_role",
          from: before,
          to: role,
        },
      ],
      { session },
    );
    result = { changed: true, email: user.email, role };
  });
  return result;
}
