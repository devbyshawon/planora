export class AppError extends Error {
  constructor(status, message, code = "REQUEST_FAILED", details = undefined) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.code === 11000)
    return res.status(409).json({
      error: {
        code: err.keyPattern?.nameKey
          ? "TEMPLATE_EXISTS"
          : err.keyPattern?.email
            ? "EMAIL_EXISTS"
            : "DUPLICATE_RECORD",
        message: err.keyPattern?.nameKey
          ? "A template with this name already exists."
          : err.keyPattern?.email
            ? "An account with this email already exists."
            : "This record already exists. Reload and retry.",
      },
    });
  if (err.type === "entity.too.large")
    return res.status(413).json({
      error: { code: "BODY_TOO_LARGE", message: "Request is too large." },
    });
  if (err.type === "entity.parse.failed")
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    });
  const status = err.status || 500;
  if (status >= 500 && !(err instanceof AppError)) console.error(err);
  res.status(status).json({
    error: {
      code: err.code || "SERVER_ERROR",
      message:
        status >= 500 && !(err instanceof AppError)
          ? "Something went wrong on the server."
          : err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}
