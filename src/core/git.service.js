import simpleGit from "simple-git";

async function cloneRepo(repoUrl, projectPath) {
  const git = simpleGit();
  try {
    await git.clone(repoUrl, projectPath);
    console.log(`Repository cloned successfully to ${projectPath}`);
  } catch (error) {
    console.error(`Failed to clone repository: ${error.message}`);
    throw error;
  }
}

export { cloneRepo };
