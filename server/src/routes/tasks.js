import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { searchTasks } from "../controllers/searchController.js";
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  taskHistory,
  getTask,
} from "../controllers/taskController.js";
const router = Router();
router.use(requireAuth);
router.get("/", listTasks);
router.get("/search", searchTasks);
router.get("/:id/history", taskHistory);
router.get("/:id", getTask);
router.post("/", createTask);
router.patch("/:id", updateTask);
router.delete("/:id", deleteTask);
export default router;
