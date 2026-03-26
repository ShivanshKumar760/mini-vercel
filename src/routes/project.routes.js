// import { Router } from "express";
// import { createProject } from "../controllers/project.controller.js";
// const router = Router();
// router.post("/create", createProject);

// export default router;

import { Router } from "express";
import {
  createProject,
  getUserProjects,
  getProjectById,
  deleteProject,
} from "../controllers/project.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

// All project routes are protected — user must be logged in
router.use(authMiddleware);

router.post("/create", createProject); // POST   /api/projects/create
router.get("/", getUserProjects); // GET    /api/projects
router.get("/:id", getProjectById); // GET    /api/projects/:id
router.delete("/:id", deleteProject); // DELETE /api/projects/:id

export default router;
