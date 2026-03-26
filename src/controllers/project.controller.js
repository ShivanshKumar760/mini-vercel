import path from "path";
import { fileURLToPath } from "url";
import { runContainer } from "../core/docker.service.js";
import Project from "../models/Project.js";
import { cloneRepo } from "../core/git.service.js";

export async function createProject(req, res) {
  const { name, githubUrl } = req.body;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectPath = path.join(__dirname, "../../workspace", name);
  await cloneRepo(githubUrl, projectPath);
  const subdomainName = name.toLowerCase().replace(/\s+/g, "-");
  const subdomain = `${subdomainName}.localhost`;
  const { containerId, url } = await runContainer(projectPath, subdomainName);
  const project = new Project({
    name,
    githubUrl,
    subdomain,
    containerId,
  });
  await project.save();
  res.json({ message: "Project created successfully", url });
}
