import express from "express";
import mongoose from "mongoose";
import router from "./routes/project.routes.js";
import authRouter from "./routes/auth.routes.js";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/projects", router);

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
