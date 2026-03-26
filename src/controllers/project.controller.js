import path from "path";
import { fileURLToPath } from "url";
import { runContainer } from "../core/docker.service.js";
import Project from "../models/Project.js";
import { cloneRepo } from "../core/git.service.js";

/**
 * SSE helper — writes a typed event to the response stream
 */
function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
/**
 * POST /api/projects/create
 * Streams build logs via SSE, saves project, then sends final URL.
 *
 * Frontend usage:
 *   const es = new EventSource(`/api/projects/create-stream?name=...&githubUrl=...`);
 */

export async function createProject(req, res) {
  // ---setup sse headers---
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const { name, githubUrl } = req.body;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectPath = path.join(__dirname, "../../workspace", name);

  const onLog = (type, message) => {
    const lines = message.split("\n").filter((l) => l.trim() !== "");
    for (const line of lines) {
      sendSSE(res, "log", { type, message: line });
    }
  };
  try {
    //1. Clone repo
    sendSSE(res, "status", { step: "clone", message: "Cloning repository..." });
    await cloneRepo(githubUrl, projectPath);
    sendSSE(res, "status", { step: "clone", message: "Repository cloned ✅" });

    // 2. Build & run container (logs stream in real time via onLog)
    sendSSE(res, "status", {
      step: "build",
      message: "Starting Docker build...",
    });
    const subdomainName = name.toLowerCase().replace(/\s+/g, "-");
    const subdomain = `${subdomainName}.localhost`;

    const { containerId, url } = await runContainer(
      projectPath,
      subdomainName,
      onLog
    );

    // 3. Persist to DB (upsert: replace if already exists)
    const existingProject = await Project.findOne({ name });
    if (existingProject) {
      await Project.deleteOne({ name });
      sendSSE(res, "status", {
        step: "db",
        message: "Existing project replaced.",
      });
    }

    const project = new Project({ name, githubUrl, subdomain, containerId });
    await project.save();

    // 4. Send final success event and close stream
    sendSSE(res, "done", {
      message: "Project deployed successfully 🚀",
      url,
    });
  } catch (err) {
    sendSSE(res, "error", {
      message: err.message || "Deployment failed",
    });
  } finally {
    res.end(); //close sse
  }
}
