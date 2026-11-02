import { AppError } from "./errors.js";
export function checkPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  )
    throw new AppError(
      400,
      "Password must contain at least 8 characters and at most 72 UTF-8 bytes.",
      "VALIDATION_ERROR",
    );
}
