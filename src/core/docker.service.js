import Docker from "dockerode";
import { spawn } from "child_process";

const docker = new Docker();

async function execInContainer(container, cmd, onLog) {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });

  return new Promise((resolve, reject) => {
    exec.start({ hijack: true, stdin: false }, (err, stream) => {
      if (err) return reject(err);

      let stdoutBuf = "";
      let stderrBuf = "";
      container.modem.demuxStream(
        stream,
        {
          write(chunk) {
            stdoutBuf += chunk.toString();
            const lines = stdoutBuf.split("\n");
            stdoutBuf = lines.pop(); // hold incomplete line
            for (const line of lines) {
              if (line.trim()) onLog("stdout", line);
            }
          },
        },
        {
          write(chunk) {
            stderrBuf += chunk.toString();
            const lines = stderrBuf.split("\n");
            stderrBuf = lines.pop();
            for (const line of lines) {
              if (line.trim()) onLog("stderr", line);
            }
          },
        }
      );
      stream.on("end", async () => {
        // Flush remaining buffer
        if (stdoutBuf.trim()) onLog("stdout", stdoutBuf);
        if (stderrBuf.trim()) onLog("stderr", stderrBuf);

        try {
          const info = await exec.inspect();
          resolve(info.ExitCode);
        } catch {
          resolve(0);
        }
      });
      stream.on("error", reject);
    });
  });
}

// ─── Spawn fallback: `docker exec` via CLI ────────────────────────────────────

function spawnExec(containerId, cmd, onLog) {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", ["exec", containerId, ...cmd]);

    let stdoutBuf = "";
    let stderrBuf = "";

    proc.stdout.on("data", (data) => {
      stdoutBuf += data.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop();
      for (const line of lines) {
        if (line.trim()) onLog("stdout", line);
      }
    });

    proc.stderr.on("data", (data) => {
      stderrBuf += data.toString();
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop();
      for (const line of lines) {
        if (line.trim()) onLog("stderr", line);
      }
    });

    proc.on("close", (code) => {
      if (stdoutBuf.trim()) onLog("stdout", stdoutBuf);
      if (stderrBuf.trim()) onLog("stderr", stderrBuf);
      resolve(code);
    });

    proc.on("error", reject); // caller falls back further if needed
  });
}

async function runStep(container, step, onLog) {
  onLog("step_start", `${step.emoji}  ${step.label}`);
  let exitCode;
  try {
    exitCode = await execInContainer(container, step.cmd, onLog);
  } catch (err) {
    onLog(
      "system",
      `⚠️  dockerode exec failed (${err.message}), retrying via spawn...`
    );
    exitCode = await spawnExec(container.id, step.cmd, onLog);
  }
  if (exitCode !== 0) {
    throw new Error(`"${step.label}" failed (exit code ${exitCode})`);
  }
  onLog("step_done", `✅  ${step.label} — done`);
}

// ─── Port poller ─────────────────────────────────────────────────────────────

async function getHostPort(container, retries = 15, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    const data = await container.inspect();
    const portData = data.NetworkSettings.Ports["3000/tcp"];
    if (portData?.[0]?.HostPort) return portData[0].HostPort;
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("Timed out waiting for port 3000 to be mapped.");
}

// ─── Build steps definition ───────────────────────────────────────────────────

/**
 * Each step is a discrete shell command exec'd inside the container.
 * This lets us stream output AND report progress per-step.
 */
const BUILD_STEPS = [
  {
    emoji: "📦",
    label: "Installing dependencies  (npm install)",
    cmd: ["sh", "-c", "cd /app && npm install"],
  },
  {
    emoji: "🔨",
    label: "Building project  (npm run build)",
    cmd: ["sh", "-c", "cd /app && npm run build"],
  },
];

// async function runContainer(projectPath, subdomain) {
//   const container = await docker.createContainer({
//     Image: "react-runner",
//     // Cmd: ["sh", "-c", "npm install && npm run build && npx serve -s build"],
//     Cmd: [
//       "sh",
//       "-c",
//       "npm install && npm run build && npx serve -s dist -l 3000",
//     ],
//     Tty: true,
//     ExposedPorts: {
//       "3000/tcp": {},
//     },
//     HostConfig: {
//       Binds: [`${projectPath}:/app`],
//       PortBindings: {
//         "3000/tcp": [{ HostPort: "" }],
//       },
//     },
//   });

//   await container.start();

//   // Wait briefly for Docker to register port bindings
//   await new Promise((resolve) => setTimeout(resolve, 1000));

//   async function getHostPort(container, retries = 5, delay = 1000) {
//     for (let i = 0; i < retries; i++) {
//       const data = await container.inspect();
//       const portData = data.NetworkSettings.Ports["3000/tcp"];
//       if (portData && portData[0]?.HostPort) {
//         return portData[0].HostPort;
//       }
//       await new Promise((resolve) => setTimeout(resolve, delay));
//     }
//     throw new Error("Timed out waiting for port 3000 to be mapped.");
//   }

//   //   const data = await container.inspect(); // Get the dynamically assigned host port
//   const hostPort = await getHostPort(container);
//   //   const hostPort = data.NetworkSettings.Ports["3000/tcp"][0].HostPort;
//   // Return the container ID and the URL to access the app
//   return {
//     containerId: container.id,
//     url: `http://${subdomain}.localhost:${hostPort}`,
//   };
// }

// export { runContainer };

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * runContainer
 *
 * Creates a container, runs install + build as separate exec steps
 * (each streaming its own output via onLog), then starts the serve
 * process and returns the public URL.
 *
 * @param {string}   projectPath  Absolute host path to the cloned repo
 * @param {string}   subdomain
 * @param {function} onLog        (type, message) => void
 *   type values:
 *     'system'     — lifecycle messages from this service
 *     'step_start' — a named step is beginning
 *     'step_done'  — a named step finished successfully
 *     'stdout'     — raw stdout from the running command
 *     'stderr'     — raw stderr from the running command
 */

async function runContainer(projectPath, subdomain, onLog = () => {}) {
  onLog("system", "🐳 Creating Docker container...");

  // Use `tail -f /dev/null` as the entrypoint so the container stays alive
  // while we exec commands into it one at a time.
  const container = await docker.createContainer({
    Image: "react-runner",
    Cmd: ["tail", "-f", "/dev/null"],
    Tty: false,
    ExposedPorts: { "3000/tcp": {} },
    HostConfig: {
      Binds: [`${projectPath}:/app`],
      PortBindings: { "3000/tcp": [{ HostPort: "" }] },
    },
  });

  await container.start();
  onLog("system", `Container started — ID: ${container.id.slice(0, 12)}`);

  // ── Run install + build, streaming each step's output live ────────────────
  for (const step of BUILD_STEPS) {
    await runStep(container, step, onLog);
  }

  // ── Launch serve in the background (fire-and-forget exec) ─────────────────
  onLog("step_start", "🌐  Starting server  (npx serve -s dist -l 3000)");

  const serveExec = await container.exec({
    Cmd: ["sh", "-c", "npx serve -s /app/dist -l 3000"],
    AttachStdout: false,
    AttachStderr: false,
    Detach: true,
    Tty: false,
  });
  await serveExec.start({ Detach: true });

  onLog("step_done", "🌐  Server process launched");

  // ── Wait for Docker to register the port binding ───────────────────────────
  onLog("system", "⏳  Waiting for port 3000 to be ready...");
  await new Promise((r) => setTimeout(r, 2000));

  const hostPort = await getHostPort(container);
  onLog(
    "system",
    `🚀  App is live → http://${subdomain}.localhost:${hostPort}`
  );

  return {
    containerId: container.id,
    url: `http://${subdomain}.localhost:${hostPort}`,
  };
}

export { runContainer };
