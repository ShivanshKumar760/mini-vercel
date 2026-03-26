// import path from "path";
// import { fileURLToPath } from "url";
// import { runContainer } from "../core/docker.service.js";
// import Project from "../models/Project.js";
// import { cloneRepo } from "../core/git.service.js";

// /**
//  * SSE helper — writes a typed event to the response stream
//  */
// function sendSSE(res, event, data) {
//   res.write(`event: ${event}\n`);
//   res.write(`data: ${JSON.stringify(data)}\n\n`);
// }
// /**
//  * POST /api/projects/create
//  * Streams build logs via SSE, saves project, then sends final URL.
//  *
//  * Frontend usage:
//  *   const es = new EventSource(`/api/projects/create-stream?name=...&githubUrl=...`);
//  */

// export async function createProject(req, res) {
//   const userId = req.user.id;
//   // ---setup sse headers---
//   res.setHeader("Content-Type", "text/event-stream");
//   res.setHeader("Cache-Control", "no-cache");
//   res.setHeader("Connection", "keep-alive");
//   res.flushHeaders();
//   const { name, githubUrl } = req.body;
//   const __dirname = path.dirname(fileURLToPath(import.meta.url));
//   const projectPath = path.join(__dirname, "../../workspace", name);

//   const onLog = (type, message) => {
//     const lines = message.split("\n").filter((l) => l.trim() !== "");
//     for (const line of lines) {
//       sendSSE(res, "log", { type, message: line });
//     }
//   };
//   try {
//     //1. Clone repo
//     sendSSE(res, "status", { step: "clone", message: "Cloning repository..." });
//     await cloneRepo(githubUrl, projectPath);
//     sendSSE(res, "status", { step: "clone", message: "Repository cloned ✅" });

//     // 2. Build & run container (logs stream in real time via onLog)
//     sendSSE(res, "status", {
//       step: "build",
//       message: "Starting Docker build...",
//     });
//     const subdomainName = name.toLowerCase().replace(/\s+/g, "-");
//     const subdomain = `${subdomainName}.localhost`;

//     const { containerId, url } = await runContainer(
//       projectPath,
//       subdomainName,
//       onLog
//     );

//     // 3. Persist to DB (upsert: replace if already exists)
//     const existingProject = await Project.findOne({ name });
//     if (existingProject) {
//       await Project.deleteOne({ name });
//       sendSSE(res, "status", {
//         step: "db",
//         message: "Existing project replaced.",
//       });
//     }

//     const project = new Project({ name, githubUrl, subdomain, containerId });
//     await project.save();

//     // 4. Send final success event and close stream
//     sendSSE(res, "done", {
//       message: "Project deployed successfully 🚀",
//       url,
//     });
//   } catch (err) {
//     sendSSE(res, "error", {
//       message: err.message || "Deployment failed",
//     });
//   } finally {
//     res.end(); //close sse
//   }
// }

//v2
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
 * Protected route — requires authMiddleware.
 * Streams build logs via SSE, saves project tied to req.user.id.
 */
export async function createProject(req, res) {
  const userId = req.user.userId; // set by authMiddleware after JWT verification

  // SSE headers — must be set before any res.write()
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const { name, githubUrl } = req.body;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectPath = path.join(__dirname, "../../workspace", name);

  // Every docker log line → SSE event to frontend
  const onLog = (type, message) => {
    const lines = message.split("\n").filter((l) => l.trim() !== "");
    for (const line of lines) {
      sendSSE(res, "log", { type, message: line });
    }
  };

  try {
    // 1. Clone repo
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

    // 3. Upsert — scoped to this user only.
    //    Re-deploying the same project name replaces the old entry.
    //    Another user's project with the same name is untouched.
    const existingProject = await Project.findOne({ name, owner: userId });
    if (existingProject) {
      await Project.deleteOne({ _id: existingProject._id });
      sendSSE(res, "status", {
        step: "db",
        message: "Existing project replaced.",
      });
    }

    const project = new Project({
      name,
      githubUrl,
      subdomain,
      containerId,
      url,
      owner: userId, // ✅ tie project to the logged-in user
    });
    await project.save();

    // 4. Done
    sendSSE(res, "done", {
      message: "Project deployed successfully 🚀",
      url,
    });
  } catch (err) {
    sendSSE(res, "error", {
      message: err.message || "Deployment failed",
    });
  } finally {
    res.end();
  }
}

/**
 * GET /api/projects
 * Returns only the projects that belong to the logged-in user.
 */
export async function getUserProjects(req, res) {
  try {
    const userId = req.user.userId;

    const projects = await Project.find({ owner: userId })
      .sort({ createdAt: -1 })
      .select("name githubUrl subdomain containerId url createdAt");

    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/projects/:id
 * Returns a single project — only if it belongs to the logged-in user.
 */
export async function getProjectById(req, res) {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const project = await Project.findOne({ _id: id, owner: userId });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /api/projects/:id
 * Deletes a project — only if it belongs to the logged-in user.
 */
export async function deleteProject(req, res) {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const project = await Project.findOneAndDelete({ _id: id, owner: userId });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({ message: "Project deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
