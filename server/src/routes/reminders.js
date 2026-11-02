import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  upcomingReminders,
  claimReminder,
} from "../controllers/reminderController.js";
const router = Router();
router.use(requireAuth);
router.get("/upcoming", upcomingReminders);
router.post("/claim", claimReminder);
export default router;
