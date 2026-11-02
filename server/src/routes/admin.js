import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireAdminUnlock } from "../middleware/admin.js";
import * as c from "../controllers/adminController.js";
const router = Router();
router.use(requireAuth, requireAdmin);
router.get("/access", c.adminAccess);
router.post(
  "/unlock",
  rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMIT",
        message: "Too many administrator unlock attempts. Try later.",
      },
    },
  }),
  c.adminUnlock,
);
router.post("/lock", c.adminLock);
router.use(requireAdminUnlock);
router.get("/summary", c.adminSummary);
router.get("/users", c.adminUsers);
router.patch("/users/:id/status", c.adminStatus);
router.get("/defaults", c.adminDefaults);
router.patch("/defaults", c.updateDefaults);
router.get("/audit", c.adminAudit);
export default router;
