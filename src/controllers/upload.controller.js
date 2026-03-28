import { v4 as uuidv4 } from "uuid";
import { extractBuildZip, saveRawFiles } from "../core/upload.service.js";
import { runPrebuiltContainer } from "../core/docker.service.js";
import Project from "../models/Project.js";

export const uploadAndDeploy = async (req, res) => {
  try {
    console.log("req.file:", req.file);
    console.log("req.files:", req.files);
    console.log("req.files length:", req.files?.length);
    console.log("req.body:", req.body);
    const projectId = uuidv4();
    const subdomain = `upload-${projectId.slice(0, 8)}`;
    const logs = [];
    const onLog = (type, msg) => {
      logs.push({ type, msg });
    };

    let projectPath;

    const isZip =
      req.file &&
      (req.file.mimetype === "application/zip" ||
        req.file.originalname?.endsWith(".zip"));
    if (isZip) {
      projectPath = extractBuildZip(req.file.buffer, projectId);
    } else if (req.files?.length) {
      // Multiple raw file uploads
      projectPath = saveRawFiles(req.files, projectId);
    } else {
      return res.status(400).json({
        message: "No file uploaded",
      });
    }

    const { containerId, url } = await runPrebuiltContainer(
      projectPath,
      subdomain,
      onLog
    );

    const project = await Project.create({
      name: req.body.name || `Upload ${projectId.slice(0, 8)}`,
      githubUrl: null,
      subdomain,
      containerId,
      url,
      owner: req.user.userId,
    });

    res.json({ project, url, logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
