// src/middleware/auth.middleware.js
import { verifyToken } from "../utils/jwt.js";

export const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ message: "Invalid token format" });
    }

    const decoded = verifyToken(token);

    req.user = decoded; // 👈 attach user to request

    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};
