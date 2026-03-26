import Docker from "dockerode";
const docker = new Docker();

async function runContainer(projectPath, subdomain) {
  const container = await docker.createContainer({
    Image: "react-runner",
    // Cmd: ["sh", "-c", "npm install && npm run build && npx serve -s build"],
    Cmd: [
      "sh",
      "-c",
      "npm install && npm run build && npx serve -s dist -l 3000",
    ],
    Tty: true,
    ExposedPorts: {
      "3000/tcp": {},
    },
    HostConfig: {
      Binds: [`${projectPath}:/app`],
      PortBindings: {
        "3000/tcp": [{ HostPort: "" }],
      },
    },
  });

  await container.start();

  // Wait briefly for Docker to register port bindings
  await new Promise((resolve) => setTimeout(resolve, 1000));

  async function getHostPort(container, retries = 5, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      const data = await container.inspect();
      const portData = data.NetworkSettings.Ports["3000/tcp"];
      if (portData && portData[0]?.HostPort) {
        return portData[0].HostPort;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw new Error("Timed out waiting for port 3000 to be mapped.");
  }

  //   const data = await container.inspect(); // Get the dynamically assigned host port
  const hostPort = await getHostPort(container);
  //   const hostPort = data.NetworkSettings.Ports["3000/tcp"][0].HostPort;
  // Return the container ID and the URL to access the app
  return {
    containerId: container.id,
    url: `http://${subdomain}.localhost:${hostPort}`,
  };
}

export { runContainer };
