import { Router } from "express";
import { createProject } from "../controllers/project.controller.js";
const router = Router();
router.post("/create", createProject);

export default router;
