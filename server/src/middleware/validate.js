import { validationResult } from "express-validator";
import { AppError } from "../utils/errors.js";
export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    throw new AppError(400, errors.array()[0].msg, "VALIDATION_ERROR");
  next();
}
