import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  progress,
  dailyReview,
  reviewTask,
} from "../controllers/insightController.js";
const router = Router();
router.use(requireAuth);
router.get("/progress", progress);
router.get("/review", dailyReview);
router.post("/review/:id", reviewTask);
export default router;
