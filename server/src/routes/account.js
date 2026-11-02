import { Router } from "express";
import { body } from "express-validator";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  updateProfile,
  updateSettings,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/accountController.js";
const router = Router();
router.use(requireAuth);
router.patch(
  "/profile",
  body("email")
    .optional()
    .isString()
    .bail()
    .trim()
    .isEmail()
    .isLength({ max: 254 })
    .toLowerCase(),
  validate,
  updateProfile,
);
router.patch("/settings", updateSettings);
router.get("/categories", listCategories);
router.post("/categories", createCategory);
router.patch("/categories/:id", updateCategory);
router.delete("/categories/:id", deleteCategory);
export default router;
