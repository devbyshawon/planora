import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  listSeries,
  getSeries,
  createSeries,
  updateSeries,
  deleteSeries,
} from "../controllers/seriesController.js";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
} from "../controllers/templateController.js";
export const seriesRoutes = Router();
seriesRoutes.use(requireAuth);
seriesRoutes.get("/", listSeries);
seriesRoutes.get("/:id", getSeries);
seriesRoutes.post("/", createSeries);
seriesRoutes.patch("/:id", updateSeries);
seriesRoutes.delete("/:id", deleteSeries);
export const templateRoutes = Router();
templateRoutes.use(requireAuth);
templateRoutes.get("/", listTemplates);
templateRoutes.post("/", createTemplate);
templateRoutes.patch("/:id", updateTemplate);
templateRoutes.delete("/:id", deleteTemplate);
templateRoutes.post("/:id/apply", applyTemplate);
