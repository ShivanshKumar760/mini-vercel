import express from "express";
import mongoose from "mongoose";
import router from "./routes/project.routes.js";
import authRouter from "./routes/auth.routes.js";
import uploadRoute from "./routes/upload.routes.js";
import cors from "cors";

import fs from "fs";
import path from "path";

["uploads", "workspaces", "dev_workspaces"].forEach((dir) =>
  fs.mkdirSync(path.resolve(dir), { recursive: true })
);

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/projects", router);
app.use("/api/upload", uploadRoute);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await mongoose.connect("mongodb://localhost:27017/vercel");
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Error starting server:", error);
  }
}

await startServer();
