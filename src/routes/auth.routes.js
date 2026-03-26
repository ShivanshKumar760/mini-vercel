import { Router } from "express";
import { register, login } from "../core/auth.service.js";
const router = Router();

router.post("/register", register); // POST /api/auth/register
router.post("/login", login); // POST /api/auth/login

export default router;
