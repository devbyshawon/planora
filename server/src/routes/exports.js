import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  previewExport,
  downloadExport,
} from "../controllers/exportController.js";
const router = Router();
router.use(requireAuth);
// POSTs materialise missing occurrences and share the per-account write lock.
router.post("/preview", previewExport);
router.post("/download", downloadExport);
export default router;
