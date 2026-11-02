import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as controller from "../controllers/googleController.js";
const router = Router();
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  } finally {
    req.releaseAccountLock?.();
  }
};
router.get("/callback", async (req, res, next) => {
  try {
    await requireAuth(req, res, () => {});
    if (req.user && !res.destroyed) await controller.googleCallback(req, res);
  } catch {
    if (!res.destroyed)
      res.redirect(303, `${req.app.locals.config.appOrigin}/?google=sign_in`);
  } finally {
    req.releaseAccountLock?.();
  }
});
router.use(requireAuth);
router.get("/status", handle(controller.googleStatus));
router.post("/connect", handle(controller.startGoogle));
router.post("/calendar", handle(controller.setupCalendar));
router.post("/disconnect", handle(controller.disconnectGoogle));
router.post("/sync", handle(controller.startSync));
router.get("/jobs/:id", handle(controller.syncResults));
router.post("/jobs/:id/step", handle(controller.stepSync));
router.post("/jobs/:id/retry", handle(controller.retrySync));
router.post("/jobs/:id/cancel", handle(controller.cancelSync));
export default router;
