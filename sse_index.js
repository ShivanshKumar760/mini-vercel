import express from "express";

const app = express();
app.use(express.json());

// ─────────────────────────────────────────────────────────────────
// CONCEPT 1 — The bare minimum SSE endpoint
//
// Three things make a response into an SSE stream:
//   1. Content-Type: text/event-stream   → tells browser "this is SSE"
//   2. Cache-Control: no-cache           → disable buffering
//   3. Connection: keep-alive            → keep the socket open
//
// Then you write "data: ...\n\n" whenever you want to push something.
// The double newline \n\n signals the END of one event.
// ─────────────────────────────────────────────────────────────────
app.get("/sse/basic", (req, res) => {
  // Step 1: Set the magic headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders(); // Flush immediately so the browser knows the stream has started

  let count = 0;

  // Step 2: Send a message every second
  const interval = setInterval(() => {
    count++;

    // SSE format: "data: <your message>\n\n"
    // The \n\n at the end is REQUIRED — it signals end of one event
    res.write(`data: Tick number ${count}\n\n`);

    if (count >= 5) {
      // Step 3: Close the stream when done
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  // Step 4: Clean up if the client disconnects early
  req.on("close", () => {
    clearInterval(interval);
    console.log("[basic] Client disconnected");
  });
});

// ─────────────────────────────────────────────────────────────────
// CONCEPT 2 — Named events
//
// By default, the browser fires a "message" event for every chunk.
// You can name your events with "event: <name>\n" before the data.
// The browser then fires that specific event name instead.
//
// Wire format:
//   event: status\n
//   data: {"step":"clone","msg":"Cloning repo..."}\n
//   \n
// ─────────────────────────────────────────────────────────────────
app.get("/sse/named-events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Helper to write a named SSE event with a JSON payload
  function send(eventName, data) {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  // Simulate a multi-step deploy pipeline
  const steps = [
    { delay: 0,    event: "status",  data: { step: "start",   msg: "Starting deployment..." } },
    { delay: 800,  event: "log",     data: { type: "stdout",  msg: "Cloning repository..." } },
    { delay: 1600, event: "log",     data: { type: "stdout",  msg: "npm install running..." } },
    { delay: 2400, event: "log",     data: { type: "stderr",  msg: "warning: deprecated package" } },
    { delay: 3200, event: "log",     data: { type: "stdout",  msg: "Build complete!" } },
    { delay: 4000, event: "status",  data: { step: "done",    msg: "Deployed!" } },
    { delay: 4200, event: "done",    data: { url: "http://myapp.localhost:3456" } },
  ];

  const timers = steps.map(({ delay, event, data }) =>
    setTimeout(() => {
      send(event, data);
      if (event === "done") res.end();
    }, delay)
  );

  req.on("close", () => timers.forEach(clearTimeout));
});

// ─────────────────────────────────────────────────────────────────
// CONCEPT 3 — Sending JSON payloads
//
// SSE data is always a string, but you can JSON.stringify() an
// object and parse it on the other side. This is how you send
// structured data (not just plain text).
// ─────────────────────────────────────────────────────────────────
app.get("/sse/json", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const stats = ["cpu", "memory", "disk"];
  let tick = 0;

  const interval = setInterval(() => {
    tick++;

    // Build a structured payload
    const payload = {
      timestamp: new Date().toISOString(),
      tick,
      metrics: {
        cpu:    Math.round(20 + Math.random() * 60),
        memory: Math.round(40 + Math.random() * 40),
        disk:   Math.round(60 + Math.random() * 20),
      },
    };

    // JSON.stringify the whole object — parse it with JSON.parse() on the client
    res.write(`data: ${JSON.stringify(payload)}\n\n`);

    if (tick >= 8) { clearInterval(interval); res.end(); }
  }, 600);

  req.on("close", () => clearInterval(interval));
});

// ─────────────────────────────────────────────────────────────────
// CONCEPT 4 — Multiple clients / broadcast
//
// SSE is server → one client. But you can keep a SET of active
// response objects and write to all of them to broadcast.
// This is how you'd build a live notification feed.
// ─────────────────────────────────────────────────────────────────
const clients = new Set(); // holds every active res object

app.get("/sse/broadcast", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Register this client
  clients.add(res);
  console.log(`[broadcast] Client connected — total: ${clients.size}`);

  // Send a welcome message to just this client
  res.write(`data: ${JSON.stringify({ type: "welcome", clientCount: clients.size })}\n\n`);

  // Remove from set on disconnect
  req.on("close", () => {
    clients.delete(res);
    console.log(`[broadcast] Client left — total: ${clients.size}`);
  });
});

// POST /broadcast — send a message to ALL connected clients
app.post("/broadcast", (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const payload = JSON.stringify({ type: "broadcast", message, sentAt: new Date().toISOString() });

  let delivered = 0;
  for (const client of clients) {
    client.write(`data: ${payload}\n\n`);
    delivered++;
  }

  res.json({ delivered, connectedClients: clients.size });
});

// ─────────────────────────────────────────────────────────────────
// CONCEPT 5 — Reconnection with Last-Event-ID
//
// If a client disconnects, EventSource auto-reconnects after ~3s.
// The browser sends the last event ID it received in the header:
//   Last-Event-ID: 42
//
// You can use this to resume from where you left off.
// Add an "id: <n>\n" line before the data to set the event ID.
//
// Wire format with ID:
//   id: 7\n
//   data: Message 7\n
//   \n
// ─────────────────────────────────────────────────────────────────
const messageLog = []; // pretend this is a DB

// Pre-populate with some messages
for (let i = 1; i <= 20; i++) {
  messageLog.push({ id: i, text: `Log entry #${i}`, time: Date.now() });
}

app.get("/sse/resumable", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Read the last ID the client received (sent automatically by EventSource)
  const lastId = parseInt(req.headers["last-event-id"] || "0", 10);
  console.log(`[resumable] Client reconnected from ID: ${lastId}`);

  // Replay any missed messages
  const missed = messageLog.filter((m) => m.id > lastId);
  for (const msg of missed) {
    res.write(`id: ${msg.id}\n`);           // ← set the event ID
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  }

  // Then continue streaming new ones
  let nextId = messageLog.length + 1;
  const interval = setInterval(() => {
    const msg = { id: nextId, text: `Live entry #${nextId}`, time: Date.now() };
    messageLog.push(msg);

    res.write(`id: ${msg.id}\n`);
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
    nextId++;

    if (nextId > 25) { clearInterval(interval); res.end(); }
  }, 800);

  req.on("close", () => clearInterval(interval));
});

// ─────────────────────────────────────────────────────────────────
// HTML UI — interactive learning interface
// ─────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SSE Playground</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Syne:wght@700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0e0e10;
    --surface: #18181c;
    --border: rgba(255,255,255,0.08);
    --accent: #f97316;
    --green: #22d3a5;
    --yellow: #fbbf24;
    --red: #f87171;
    --blue: #60a5fa;
    --muted: rgba(255,255,255,0.4);
    --text: rgba(255,255,255,0.88);
  }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.7;
    min-height: 100vh;
  }
  header {
    padding: 28px 32px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: baseline;
    gap: 16px;
  }
  header h1 {
    font-family: 'Syne', sans-serif;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
  }
  header span {
    color: var(--muted);
    font-size: 12px;
  }
  .layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    height: calc(100vh - 73px);
  }
  .sidebar {
    border-right: 1px solid var(--border);
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sidebar-label {
    font-size: 10px;
    letter-spacing: 2px;
    color: var(--muted);
    padding: 4px 8px;
    margin-top: 8px;
  }
  .demo-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    transition: border-color 0.2s, background 0.2s;
    width: 100%;
  }
  .demo-btn:hover { border-color: rgba(249,115,22,0.4); background: rgba(249,115,22,0.06); }
  .demo-btn.active { border-color: var(--accent); background: rgba(249,115,22,0.1); }
  .demo-btn .btn-title { font-weight: 700; color: var(--accent); margin-bottom: 3px; }
  .demo-btn .btn-desc { color: var(--muted); font-size: 11px; line-height: 1.5; }
  .broadcast-input {
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    display: none;
  }
  .broadcast-input.visible { display: block; }
  .broadcast-input input {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    color: var(--text);
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    margin-bottom: 6px;
  }
  .broadcast-input button {
    width: 100%;
    background: var(--accent);
    border: none;
    border-radius: 6px;
    padding: 8px;
    color: #fff;
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    letter-spacing: 0.5px;
  }
  .main {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .concept-panel {
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border);
    display: none;
  }
  .concept-panel.visible { display: block; }
  .concept-title {
    font-family: 'Syne', sans-serif;
    font-size: 17px;
    font-weight: 800;
    margin-bottom: 6px;
  }
  .concept-desc { color: var(--muted); font-size: 12px; line-height: 1.8; max-width: 700px; }
  .wire-format {
    margin-top: 10px;
    background: #0a0a0c;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 11px;
    line-height: 2;
    color: var(--green);
    display: inline-block;
  }
  .wire-format .comment { color: var(--muted); }
  .toolbar {
    padding: 10px 24px;
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .run-btn {
    background: var(--accent);
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    color: #fff;
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: opacity 0.2s;
  }
  .run-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .stop-btn {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 14px;
    color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    cursor: pointer;
  }
  .stop-btn:hover { border-color: var(--red); color: var(--red); }
  .clear-btn {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 14px;
    color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    cursor: pointer;
    margin-left: auto;
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--muted);
    transition: background 0.3s;
    flex-shrink: 0;
  }
  .status-dot.live { background: var(--green); box-shadow: 0 0 0 3px rgba(34,211,165,0.2); }
  .status-dot.done { background: var(--muted); }
  .status-text { font-size: 11px; color: var(--muted); }
  .log-area {
    flex: 1;
    overflow-y: auto;
    padding: 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .log-line {
    display: flex;
    gap: 12px;
    align-items: baseline;
    padding: 4px 0;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
  .log-time { color: var(--muted); font-size: 10px; flex-shrink: 0; width: 70px; }
  .log-event { font-size: 10px; padding: 1px 7px; border-radius: 999px; flex-shrink: 0; font-weight: 700; }
  .event-message { background: rgba(96,165,250,0.15); color: var(--blue); }
  .event-status  { background: rgba(251,191,36,0.15); color: var(--yellow); }
  .event-log     { background: rgba(34,211,165,0.15); color: var(--green); }
  .event-done    { background: rgba(249,115,22,0.15); color: var(--accent); }
  .event-error   { background: rgba(248,113,113,0.15); color: var(--red); }
  .event-welcome { background: rgba(34,211,165,0.15); color: var(--green); }
  .event-broadcast { background: rgba(249,115,22,0.15); color: var(--accent); }
  .event-system  { background: rgba(255,255,255,0.08); color: var(--muted); }
  .log-data { color: var(--text); flex: 1; word-break: break-all; }
  .log-data .key { color: var(--muted); }
  .log-data .str { color: var(--green); }
  .log-data .num { color: var(--yellow); }
  .empty-state {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: var(--muted); font-size: 12px; text-align: center; line-height: 2;
  }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
</style>
</head>
<body>

<header>
  <h1>SSE Playground</h1>
  <span>Server-Sent Events — interactive learning</span>
</header>

<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-label">CONCEPTS</div>

    <button class="demo-btn active" data-demo="basic" onclick="selectDemo('basic')">
      <div class="btn-title">01 — Basic stream</div>
      <div class="btn-desc">The minimum SSE setup. Headers, data format, and closing the stream.</div>
    </button>

    <button class="demo-btn" data-demo="named" onclick="selectDemo('named')">
      <div class="btn-title">02 — Named events</div>
      <div class="btn-desc">Use event: to name events. Client listens for specific types.</div>
    </button>

    <button class="demo-btn" data-demo="json" onclick="selectDemo('json')">
      <div class="btn-title">03 — JSON payloads</div>
      <div class="btn-desc">Stringify objects as data. Parse them on the client with JSON.parse().</div>
    </button>

    <button class="demo-btn" data-demo="broadcast" onclick="selectDemo('broadcast')">
      <div class="btn-title">04 — Broadcast</div>
      <div class="btn-desc">Multiple clients, one server. POST a message to push to all.</div>
    </button>

    <button class="demo-btn" data-demo="resumable" onclick="selectDemo('resumable')">
      <div class="btn-title">05 — Resumable (id:)</div>
      <div class="btn-desc">Use id: so the browser can resume after disconnect.</div>
    </button>

    <div class="broadcast-input" id="broadcast-controls">
      <div class="sidebar-label" style="margin-top:0;margin-bottom:8px">SEND TO ALL CLIENTS</div>
      <input type="text" id="broadcast-msg" placeholder="Type a message..." />
      <button onclick="sendBroadcast()">Broadcast →</button>
    </div>
  </aside>

  <main class="main">
    <!-- Concept explanations -->
    <div class="concept-panel visible" id="panel-basic">
      <div class="concept-title">Concept 1 — The bare minimum</div>
      <div class="concept-desc">
        Three headers turn a normal HTTP response into an SSE stream. Then you write
        <code>data: your message\\n\\n</code> whenever you want to push something.
        The <strong>double newline</strong> is mandatory — it marks the end of one event.
      </div>
      <div class="wire-format">
        <span class="comment"># What travels over the wire:</span><br>
        data: Tick number 1<span style="color:var(--accent)">\\n\\n</span><br>
        data: Tick number 2<span style="color:var(--accent)">\\n\\n</span><br>
        <span class="comment"># ↑ Each \\n\\n = end of one event</span>
      </div>
    </div>

    <div class="concept-panel" id="panel-named">
      <div class="concept-title">Concept 2 — Named events</div>
      <div class="concept-desc">
        Add <code>event: name\\n</code> before the data. The browser fires
        <code>es.addEventListener('name', ...)</code> instead of the generic onmessage.
        This is how you route different message types (status, log, done, error).
      </div>
      <div class="wire-format">
        event: log<span style="color:var(--accent)">\\n</span><br>
        data: {"type":"stdout","msg":"npm install..."}<span style="color:var(--accent)">\\n\\n</span><br>
        event: done<span style="color:var(--accent)">\\n</span><br>
        data: {"url":"http://app.localhost"}<span style="color:var(--accent)">\\n\\n</span>
      </div>
    </div>

    <div class="concept-panel" id="panel-json">
      <div class="concept-title">Concept 3 — JSON payloads</div>
      <div class="concept-desc">
        SSE data is always a plain string. Wrap structured data with
        <code>JSON.stringify()</code> on the server and <code>JSON.parse(event.data)</code>
        on the client. You can send any object — metrics, log lines, progress updates.
      </div>
      <div class="wire-format">
        <span class="comment"># Server:</span><br>
        res.write(<span style="color:var(--green)">\`data: \${JSON.stringify(payload)}\\n\\n\`</span>)<br><br>
        <span class="comment"># Client:</span><br>
        es.onmessage = (e) => { const obj = JSON.parse(e.data) }
      </div>
    </div>

    <div class="concept-panel" id="panel-broadcast">
      <div class="concept-title">Concept 4 — Broadcast to multiple clients</div>
      <div class="concept-desc">
        SSE is one server → one client. To broadcast, keep a <code>Set</code> of active
        <code>res</code> objects. A POST endpoint iterates the set and writes to each one.
        Open this page in two browser tabs, then send a message below.
      </div>
      <div class="wire-format">
        <span class="comment"># Store connections:</span><br>
        const clients = new Set()<br>
        clients.add(res)  <span class="comment">// on connect</span><br>
        clients.delete(res)  <span class="comment">// on disconnect</span><br><br>
        <span class="comment"># Broadcast:</span><br>
        for (const client of clients) client.write(payload)
      </div>
    </div>

    <div class="concept-panel" id="panel-resumable">
      <div class="concept-title">Concept 5 — Reconnection with id:</div>
      <div class="concept-desc">
        Add <code>id: N\\n</code> before each event. If the client disconnects,
        EventSource auto-reconnects and sends <code>Last-Event-ID: N</code> in the header.
        The server uses that to replay missed events — zero message loss.
      </div>
      <div class="wire-format">
        id: 7<span style="color:var(--accent)">\\n</span><br>
        data: {"text":"Log entry #7"}<span style="color:var(--accent)">\\n\\n</span><br><br>
        <span class="comment"># On reconnect, browser sends:</span><br>
        Last-Event-ID: 7  <span class="comment">→ server replays from #8</span>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <button class="run-btn" id="run-btn" onclick="runDemo()">▶ Connect</button>
      <button class="stop-btn" onclick="stopDemo()">■ Stop</button>
      <div class="status-dot" id="status-dot"></div>
      <span class="status-text" id="status-text">idle</span>
      <button class="clear-btn" onclick="clearLogs()">Clear</button>
    </div>

    <!-- Log output -->
    <div class="log-area" id="log-area">
      <div class="empty-state" id="empty-state">
        Click <strong>Connect</strong> to open an SSE stream<br>
        and watch events arrive in real time
      </div>
    </div>
  </main>
</div>

<script>
let currentDemo = 'basic';
let es = null;
let logCount = 0;

const demos = {
  basic:     { url: '/sse/basic',        events: ['message'] },
  named:     { url: '/sse/named-events', events: ['status','log','done'] },
  json:      { url: '/sse/json',         events: ['message'] },
  broadcast: { url: '/sse/broadcast',    events: ['message','welcome','broadcast'] },
  resumable: { url: '/sse/resumable',    events: ['message'] },
};

function selectDemo(name) {
  currentDemo = name;
  document.querySelectorAll('.demo-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-demo="' + name + '"]').classList.add('active');
  document.querySelectorAll('.concept-panel').forEach(p => p.classList.remove('visible'));
  document.getElementById('panel-' + name).classList.add('visible');
  document.getElementById('broadcast-controls').classList.toggle('visible', name === 'broadcast');
  stopDemo();
  clearLogs();
}

function setStatus(state, text) {
  const dot = document.getElementById('status-dot');
  dot.className = 'status-dot' + (state === 'live' ? ' live' : '');
  document.getElementById('status-text').textContent = text;
}

function addLog(eventName, data) {
  logCount++;
  const area = document.getElementById('log-area');
  const empty = document.getElementById('empty-state');
  if (empty) empty.remove();

  const line = document.createElement('div');
  line.className = 'log-line';

  const time = new Date().toLocaleTimeString('en', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' });

  let displayData = data;
  try {
    const parsed = JSON.parse(data);
    displayData = syntaxHighlight(parsed);
  } catch {
    displayData = '<span class="str">' + data + '</span>';
  }

  const eventClass = 'event-' + eventName.toLowerCase();

  line.innerHTML =
    '<span class="log-time">' + time + '</span>' +
    '<span class="log-event ' + eventClass + '">' + eventName + '</span>' +
    '<span class="log-data">' + displayData + '</span>';

  area.appendChild(line);
  area.scrollTop = area.scrollHeight;
}

function syntaxHighlight(obj) {
  const json = JSON.stringify(obj, null, 0);
  return json
    .replace(/"([^"]+)":/g, '<span class="key">"$1"</span>:')
    .replace(/: "([^"]+)"/g, ': <span class="str">"$1"</span>')
    .replace(/: (\d+)/g, ': <span class="num">$1</span>');
}

function runDemo() {
  if (es) es.close();

  const demo = demos[currentDemo];
  es = new EventSource(demo.url);

  setStatus('live', 'connected');
  document.getElementById('run-btn').disabled = true;

  // Always listen for generic message events
  es.onmessage = (e) => addLog('message', e.data);

  // Listen for named events
  demo.events.forEach(name => {
    if (name !== 'message') {
      es.addEventListener(name, (e) => addLog(name, e.data));
    }
  });

  es.onerror = () => {
    setStatus('done', 'closed');
    document.getElementById('run-btn').disabled = false;
    es = null;
  };
}

function stopDemo() {
  if (es) { es.close(); es = null; }
  setStatus('done', 'stopped');
  document.getElementById('run-btn').disabled = false;
}

function clearLogs() {
  const area = document.getElementById('log-area');
  area.innerHTML = '<div class="empty-state" id="empty-state">Click <strong>Connect</strong> to open an SSE stream<br>and watch events arrive in real time</div>';
  logCount = 0;
}

async function sendBroadcast() {
  const msg = document.getElementById('broadcast-msg').value.trim();
  if (!msg) return;
  await fetch('/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg }),
  });
  document.getElementById('broadcast-msg').value = '';
}

document.getElementById('broadcast-msg').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBroadcast();
});
</script>
</body>
</html>`);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n  SSE Playground running at http://localhost:${PORT}\n`);
  console.log(`  Endpoints:`);
  console.log(`  GET  /sse/basic          — concept 1: bare minimum stream`);
  console.log(`  GET  /sse/named-events   — concept 2: named events`);
  console.log(`  GET  /sse/json           — concept 3: JSON payloads`);
  console.log(`  GET  /sse/broadcast      — concept 4: multiple clients`);
  console.log(`  POST /broadcast          — send message to all clients`);
  console.log(`  GET  /sse/resumable      — concept 5: reconnection with id:\n`);
});