# ▲ VercelLite — Mini Vercel

A lightweight self-hosted deployment platform. Paste a GitHub repo URL, click Deploy, and watch your app build live inside Docker — logs streaming to your browser in real time.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Request Flow](#request-flow)
- [Authentication Flow](#authentication-flow)
- [Docker Build Pipeline](#docker-build-pipeline)
- [SSE Log Streaming](#sse-log-streaming)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)

---

## Overview

VercelLite is a full-stack deployment dashboard built to mimic the core loop of Vercel:

1. User pastes a GitHub repo URL
2. Backend clones the repo, spins up a Docker container, and runs `npm install` → `npm run build` → `serve`
3. Every log line streams back to the browser via **Server-Sent Events (SSE)** in real time
4. The deployed app is accessible at a `subdomain.localhost:PORT` URL

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BROWSER (React)                            │
│                                                                     │
│   Landing ──► Login ──► Dashboard ──► Deploy                        │
│                              │              │                       │
│                         fetch projects   POST /create               │
│                              │           + read SSE stream          │
└──────────────────────────────┼──────────────┼───────────────────────┘
                               │              │
                        REST (JSON)      SSE stream
                               │              │
┌──────────────────────────────┼──────────────┼───────────────────────┐
│                       EXPRESS API (Node.js)                         │
│                                                                     │
│  /api/auth/*          /api/projects/*                               │
│  ┌──────────┐         ┌───────────────────────────────────┐         │
│  │ register │         │ POST /create  (SSE)               │         │
│  │ login    │         │ GET  /        (list)              │         │
│  └──────────┘         │ GET  /:id     (single)            │         │
│        │              │ DELETE /:id   (remove)            │         │
│   JWT issued          └──────────────┬────────────────────┘         │
│        │                            │                               │
│  authMiddleware ◄───────────────────┘                               │
│  (validates Bearer token on every /projects route)                  │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
              ┌────────────────┼─────────────────┐
              │                │                 │
         MongoDB          git clone          Docker API
         (Mongoose)       (simple-git)       (dockerode)
              │                │                 │
         stores User      workspace/          react-runner
         & Project        <name>/             container
         documents        (bind mount)
```

---

## Request Flow

The complete lifecycle of a deploy request:

```
Browser                    Express                  Docker
   │                          │                       │
   │  POST /api/projects/create                        │
   │  { name, githubUrl }      │                       │
   │ ─────────────────────────►│                       │
   │                          │                       │
   │  ← SSE headers open ─────│                       │
   │  (text/event-stream)      │                       │
   │                          │                       │
   │                          │  git clone repo        │
   │                          │ ──────────────────────►│
   │  event: status ──────────│                       │
   │  "Cloning repository..."  │                       │
   │                          │  clone complete        │
   │  event: status ──────────│◄──────────────────────│
   │  "Repository cloned ✅"   │                       │
   │                          │                       │
   │                          │  createContainer()     │
   │                          │  (tail -f /dev/null)   │
   │                          │ ──────────────────────►│
   │                          │  container.start()     │
   │                          │ ──────────────────────►│
   │                          │                       │
   │  event: step_start ──────│  exec: npm install     │
   │  "Installing deps..."     │ ──────────────────────►│
   │                          │                       │ npm install
   │  event: log (stdout) ────│◄── chunk by chunk ────│ running...
   │  "added 150 packages"     │                       │
   │  event: log (stdout) ────│◄──────────────────────│
   │  ...                      │                       │
   │  event: step_done ───────│  exit code 0          │
   │  "npm install ✅"         │◄──────────────────────│
   │                          │                       │
   │  event: step_start ──────│  exec: npm run build   │
   │  "Building project..."    │ ──────────────────────►│
   │  event: log (stdout) ────│◄── vite output ───────│
   │  ...                      │                       │
   │  event: step_done ───────│  exit code 0          │
   │                          │◄──────────────────────│
   │                          │                       │
   │                          │  exec: serve -s dist   │
   │                          │  (detached)            │
   │                          │ ──────────────────────►│
   │                          │                       │ :3000 open
   │                          │  inspect() → hostPort  │
   │                          │ ──────────────────────►│
   │                          │◄──────────────────────│
   │                          │                       │
   │                          │  save Project to DB    │
   │                          │  { owner: userId }     │
   │                          │                       │
   │  event: done ────────────│                       │
   │  { url: "http://..." }    │                       │
   │                          │                       │
   │  res.end() ──────────────│                       │
   │  (SSE stream closed)      │                       │
```

---

## Authentication Flow

JWT-based auth — stateless, no sessions.

```
 ┌──────────┐        POST /api/auth/register        ┌──────────────┐
 │  Browser │  ──── { email, password } ──────────► │   Express    │
 └──────────┘                                        │              │
                                                     │  bcrypt.hash │
                                                     │  User.create │
                                                     │  JWT.sign    │
 ┌──────────┐        { token }                       └──────────────┘
 │  Browser │  ◄──────────────────────────────────────────────────
 │          │
 │ localStorage                   Every protected request:
 │ token = "eyJ..."               ┌──────────────────────────────┐
 └──────────┘                     │  Authorization: Bearer <JWT> │
                                  └──────────────┬───────────────┘
                                                 │
                                  ┌──────────────▼───────────────┐
                                  │      authMiddleware           │
                                  │                              │
                                  │  verifyToken(jwt)            │
                                  │  → decode payload            │
                                  │  → req.user = { id, email }  │
                                  │  → next()                    │
                                  └──────────────────────────────┘
```

---

## Docker Build Pipeline

Each deployment uses a **long-lived container** with commands exec'd one at a time so logs can be streamed per-step:

```
  docker.createContainer({
    Image: "react-runner",           ← pre-built Node 20 image
    Cmd:   ["tail", "-f", "/dev/null"], ← keeps container alive
    Binds: ["/host/path:/app"],      ← repo mounted into container
    PortBindings: { "3000/tcp": [{ HostPort: "" }] }  ← random port
  })
         │
         ▼
  container.start()
         │
         ├─── exec: npm install ──────── streams stdout/stderr via demuxStream
         │         (exit 0)
         │
         ├─── exec: npm run build ─────── streams stdout/stderr via demuxStream
         │         (exit 0)
         │
         └─── exec: serve -s dist -l 3000   (detached, stays running)
                    │
                    ▼
             container.inspect()
             → NetworkSettings.Ports["3000/tcp"][0].HostPort
             → e.g. 49234
                    │
                    ▼
         http://myapp.localhost:49234   ← returned to frontend
```

### react-runner Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

RUN npm install -g serve

EXPOSE 3000

CMD ["tail", "-f", "/dev/null"]
```

> **Why `tail -f /dev/null`?**  
> Running `npm install && npm run build` as a single `CMD` makes Docker buffer all output and only stream it when the command finishes. By keeping the container alive with a no-op process and using `container.exec()` for each step, we can stream every line of output as it happens.

---

## SSE Log Streaming

Server-Sent Events let the server push data to the browser over a single long-lived HTTP connection — no WebSocket needed.

```
Wire format (plain text):

  event: step_start
  data: {"message":"📦  Installing dependencies  (npm install)"}

  event: log
  data: {"type":"stdout","message":"added 150 packages in 1m"}

  event: log
  data: {"type":"stderr","message":"npm warn EBADENGINE ..."}

  event: step_done
  data: {"message":"✅  npm install — done"}

  event: done
  data: {"url":"http://myapp.localhost:49234","message":"Deployed 🚀"}
```

### Event types

| Event        | When it fires                              | Payload                        |
|-------------|---------------------------------------------|--------------------------------|
| `status`    | Clone start/done, build start               | `{ step, message }`            |
| `step_start`| A named Docker exec step begins             | `{ message }`                  |
| `log`       | A stdout/stderr line arrives from container | `{ type, message }`            |
| `step_done` | A named step exits with code 0              | `{ message }`                  |
| `done`      | Everything finished, project saved          | `{ url, message }`             |
| `error`     | Any step threw an error                     | `{ message }`                  |

### Why `fetch` instead of `EventSource`?

`EventSource` only supports `GET` requests. Since the deploy endpoint is a `POST` (it sends `name` and `githubUrl` in the body), the frontend uses `fetch` + `ReadableStream` and parses the SSE protocol manually:

```js
const response = await fetch("/api/projects/create", { method: "POST", ... });
const reader = response.body.getReader();

// Split on \n\n (SSE event boundaries) and parse event + data lines
```

---

## Project Structure

```
mini-vercel/
├── src/
│   ├── controllers/
│   │   └── project.controller.js   # createProject, getUserProjects, etc.
│   ├── core/
│   │   ├── docker.service.js       # runContainer, execInContainer, spawnExec
│   │   ├── git.service.js          # cloneRepo
│   │   └── auth.service.js         # register, login
│   ├── middleware/
│   │   └── auth.middleware.js      # JWT verification → req.user
│   ├── models/
│   │   ├── Project.js              # { name, githubUrl, subdomain, containerId, owner }
│   │   └── User.js                 # { email, passwordHash }
│   ├── routes/
│   │   ├── project.routes.js       # /api/projects/* (all behind authMiddleware)
│   │   └── auth.routes.js          # /api/auth/register, /api/auth/login
│   └── server.js                   # Express app, MongoDB connect, listen
│
├── workspace/                       # Cloned repos land here (git-ignored)
│   └── <project-name>/
│
├── Dockerfile                       # react-runner image (node:20-alpine)
└── frontend/
    └── src/
        ├── pages/
        │   ├── Landing.jsx
        │   ├── Login.jsx
        │   ├── Dashboard.jsx
        │   └── Deploy.jsx
        ├── lib/
        │   ├── auth.js             # getToken, setToken, clearToken, getAuthHeaders
        │   └── http.js             # apiJson helper, API_BASE
        └── App.jsx                 # Client-side router (pushState)
```

---

## Tech Stack

| Layer       | Technology                                |
|------------|-------------------------------------------|
| Frontend   | React 18, Vite, DM Sans                   |
| Routing    | Custom `pushState` SPA router             |
| Backend    | Node.js, Express 5                        |
| Auth       | JWT (`jsonwebtoken`), bcryptjs            |
| Database   | MongoDB, Mongoose                         |
| Containers | Docker, dockerode (Node SDK)              |
| Log stream | SSE over `fetch` + `ReadableStream`       |
| Git        | simple-git                                |
| Serving    | `serve` (static file server inside container) |

---

## Getting Started

### 1. Build the Docker image

```bash
docker build -t react-runner .
```

### 2. Start MongoDB

```bash
docker run -d -p 27017:27017 mongo:7
```

### 3. Start the backend

```bash
cd src
npm install
node server.js
# → Connected to MongoDB
# → Server is running on port 5000
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### 5. Deploy a project

1. Open `http://localhost:5173`
2. Register an account
3. Click **Deploy**, paste a GitHub repo URL for a Vite/React app
4. Watch the build logs stream live
5. Click the generated URL to open your deployed app

---

## API Reference

All `/api/projects` routes require `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint              | Body                    | Response         |
|--------|-----------------------|-------------------------|------------------|
| POST   | `/api/auth/register`  | `{ email, password }`   | `{ token }`      |
| POST   | `/api/auth/login`     | `{ email, password }`   | `{ token }`      |

### Projects

| Method | Endpoint                   | Body / Params              | Response                   |
|--------|----------------------------|----------------------------|----------------------------|
| POST   | `/api/projects/create`     | `{ name, githubUrl }`      | SSE stream → `{ url }`     |
| GET    | `/api/projects`            | —                          | `{ projects: [...] }`      |
| GET    | `/api/projects/:id`        | `:id` = MongoDB `_id`      | `{ project }`              |
| DELETE | `/api/projects/:id`        | `:id` = MongoDB `_id`      | `{ message }`              |

### SSE Response (POST /api/projects/create)

The response body is a stream of SSE events (see [SSE Log Streaming](#sse-log-streaming) above). The connection closes after the `done` or `error` event is sent.

---

## Key Design Decisions

**Why exec per step instead of one big CMD?**  
Splitting `npm install`, `npm run build`, and `serve` into separate `container.exec()` calls means each step can be awaited individually — if the build fails, we get the exact exit code and can surface a clear error. It also allows the step tracker UI to update in real time.

**Why bind-mount instead of `COPY`?**  
Each deployment is a different repo. Bind-mounting the cloned repo into `/app` avoids rebuilding the Docker image for every project. The `react-runner` image is a reusable Node 20 environment that receives whatever code is mounted into it.

**Why SSE instead of WebSockets?**  
Log streaming is unidirectional — server to browser only. SSE is simpler to implement (plain HTTP), works through proxies, and auto-reconnects natively. WebSockets would add complexity with no benefit here.

**Why random `HostPort: ""`?**  
Docker assigns a random available port on the host. This avoids port conflicts when multiple projects are running simultaneously. The port is retrieved via `container.inspect()` after the serve process binds to `3000` inside the container.
