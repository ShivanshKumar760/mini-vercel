/**
 * Deploys a pre-built project — skips npm install + build entirely.
 * Expects <projectPath>/dist to already exist on the host.
 */
export async function runPrebuiltContainer(
  projectPath,
  subdomain,
  onLog = () => {}
) {
  onLog("system", "🐳 Creating container for prebuilt app...");

  const container = await docker.createContainer({
    Image: "react-runner",
    Cmd: ["tail", "-f", "/dev/null"], // keep alive for exec
    Tty: false,
    ExposedPorts: { "3000/tcp": {} },
    HostConfig: {
      Binds: [`${projectPath}:/app`], // dist lives at /app/dist inside container
      PortBindings: { "3000/tcp": [{ HostPort: "" }] },
    },
  });

  await container.start();
  onLog("system", `Container started — ${container.id.slice(0, 12)}`);

  // Skip BUILD_STEPS — go straight to serve
  onLog("step_start", "🌐  Starting server  (npx serve -s /app/dist -l 3000)");

  const serveExec = await container.exec({
    Cmd: ["sh", "-c", "npx serve -s /app/dist -l 3000"],
    AttachStdout: false,
    AttachStderr: false,
    Detach: true,
    Tty: false,
  });
  await serveExec.start({ Detach: true });

  onLog("step_done", "🌐  Server launched");
  onLog("system", "⏳  Waiting for port 3000...");

  await new Promise((r) => setTimeout(r, 2000));
  const hostPort = await getHostPort(container);

  onLog("system", `🚀  Live → http://${subdomain}.localhost:${hostPort}`);
  return {
    containerId: container.id,
    url: `http://${subdomain}.localhost:${hostPort}`,
  };
}
