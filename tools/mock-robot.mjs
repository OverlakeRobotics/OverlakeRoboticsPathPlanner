#!/usr/bin/env node
// Mock FTC robot for testing the Overlake Path Planner webapp without hardware.
//
// Emulates both servers the webapp talks to on the real Control Hub:
//   - ws://localhost:8000/   FtcDashboard 0.4.16 message protocol
//                            (INIT/START/STOP_OP_MODE, GET_ROBOT_STATUS)
//   - http://localhost:8099  PathServer (POST /points, GET /pose|/start|/config)
//     Only reachable while an OpMode is INIT or RUNNING, matching PathServer's
//     real lifecycle (started in OpMode init(), stopped in stop()).
//
// A simulated robot drives uploaded paths with the same point-advance logic as
// OdometryHolonomicDrivetrain and fires tags like PathPlanExample (velocity,
// pause; anything else is logged).
//
// Usage:
//   node tools/mock-robot.mjs [--always-on]
//   then open the webapp with ?hub=127.0.0.1 (e.g. http://localhost:5173/?hub=127.0.0.1)
//
// --always-on: serve HTTP even with no OpMode active (skips lifecycle gating)

import { createServer } from "node:http";
import { createHash } from "node:crypto";

const WS_PORT = 8000;
const HTTP_PORT = 8099;
const ALWAYS_ON = process.argv.includes("--always-on");

const OP_MODE_LIST = [
  "Path Planning Example",
  "Odometry Auton Example",
  "TeleOp Example",
];
const STOP_OP_MODE_NAME = "$Stop$Robot$";

const TICK_MS = 20;
const HEADING_RATE_DEG_S = 270;
const DONE_POS_TOL_IN = 0.5;
const DONE_HEADING_TOL_DEG = 1.0;

const now = () => Date.now();
const ts = () => new Date().toISOString().slice(11, 23);
const log = (tag, msg) => console.log(`${ts()} [${tag}] ${msg}`);
const round2 = (n) => Math.round(n * 100) / 100;
const normDeg = (d) => {
  let a = d % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
};

// ---------------------------------------------------------------------------
// Robot state (mirrors PathServer's volatile statics + follower state)
// ---------------------------------------------------------------------------
const robot = {
  activeOpMode: STOP_OP_MODE_NAME,
  status: "STOPPED", // INIT | RUNNING | STOPPED
  pose: { x: 0, y: 0, h: 0 },
  poseT: now(),
  // PathServer storage
  start: [0, 0, 0],
  points: [], // [[x, y, h], ...] dense samples, start excluded
  velocity: 0,
  tolerance: 0,
  alliance: "unknown",
  tags: [], // [{index, name, value}] sorted by index
  // follower
  driving: false,
  currentPoint: 0,
  driveVelocity: 0,
  tagPtr: 0,
  pauseUntil: 0,
  driveStartedAt: 0,
};

const serverActive = () =>
  ALWAYS_ON || robot.status === "INIT" || robot.status === "RUNNING";

// ---------------------------------------------------------------------------
// Simulated follower (mirrors OdometryHolonomicDrivetrain + PathPlanExample)
// ---------------------------------------------------------------------------
function startFollowing() {
  if (robot.points.length === 0) {
    log(
      "SIM",
      "START with no uploaded path — the real PathPlanExample would CRASH here (empty getPath() -> ArrayIndexOutOfBoundsException). Not driving."
    );
    return;
  }
  robot.pose = { x: robot.start[0], y: robot.start[1], h: robot.start[2] };
  robot.currentPoint = 0;
  robot.driveVelocity = robot.velocity;
  robot.tagPtr = 0;
  robot.pauseUntil = 0;
  robot.driving = true;
  robot.driveStartedAt = now();
  if (robot.driveVelocity <= 0) {
    log("SIM", "warning: uploaded velocity is 0 — robot will not move (same as real robot)");
  }
  log(
    "SIM",
    `following path: ${robot.points.length} points, v=${robot.velocity} in/s, tol=${robot.tolerance} in, ${robot.tags.length} tags`
  );
}

function fireTags() {
  while (
    robot.tagPtr < robot.tags.length &&
    robot.tags[robot.tagPtr].index <= robot.currentPoint
  ) {
    const tag = robot.tags[robot.tagPtr++];
    if (tag.name === "velocity") {
      robot.driveVelocity = tag.value;
      log("SIM", `tag velocity=${tag.value} fired at point ${robot.currentPoint} — speed changed`);
    } else if (tag.name === "pause") {
      if (tag.index === 0) {
        log(
          "SIM",
          "WARNING: pause tag on the start point — the real PathPlanExample would CRASH (positions[-1]). Pausing anyway."
        );
      }
      robot.pauseUntil = now() + tag.value * 1000;
      log("SIM", `tag pause=${tag.value}s fired at point ${robot.currentPoint}`);
    } else {
      log(
        "SIM",
        `tag "${tag.name}"=${tag.value} fired at point ${robot.currentPoint} (custom tag — your OpMode defines what this does)`
      );
    }
  }
}

function tick() {
  if (serverActive()) robot.poseT = now();
  if (!robot.driving || robot.status !== "RUNNING") return;

  fireTags();
  if (now() < robot.pauseUntil) return;

  const dt = TICK_MS / 1000;
  const tolEff = Math.max(robot.tolerance, DONE_POS_TOL_IN);
  let target = robot.points[robot.currentPoint];
  let dist = Math.hypot(target[0] - robot.pose.x, target[1] - robot.pose.y);

  // advance waypoints while inside tolerance (same as the real follower)
  while (dist < tolEff && robot.currentPoint < robot.points.length - 1) {
    robot.currentPoint += 1;
    target = robot.points[robot.currentPoint];
    dist = Math.hypot(target[0] - robot.pose.x, target[1] - robot.pose.y);
    fireTags();
  }

  // translate toward target at driveVelocity
  const step = Math.max(robot.driveVelocity, 0) * dt;
  if (dist > 1e-9) {
    const f = Math.min(step / dist, 1);
    robot.pose.x += (target[0] - robot.pose.x) * f;
    robot.pose.y += (target[1] - robot.pose.y) * f;
  }

  // slew heading toward target heading
  const dh = normDeg(target[2] - robot.pose.h);
  const maxTurn = HEADING_RATE_DEG_S * dt;
  robot.pose.h = normDeg(
    robot.pose.h + Math.sign(dh) * Math.min(Math.abs(dh), maxTurn)
  );

  // completion check (same thresholds as isDriving())
  const atEnd =
    robot.currentPoint === robot.points.length - 1 &&
    Math.hypot(target[0] - robot.pose.x, target[1] - robot.pose.y) < DONE_POS_TOL_IN &&
    Math.abs(normDeg(target[2] - robot.pose.h)) < DONE_HEADING_TOL_DEG;
  if (atEnd) {
    robot.driving = false;
    log(
      "SIM",
      `path complete in ${((now() - robot.driveStartedAt) / 1000).toFixed(1)}s at (${round2(robot.pose.x)}, ${round2(robot.pose.y)}, ${round2(robot.pose.h)}°)`
    );
  }
}

setInterval(tick, TICK_MS);

// ---------------------------------------------------------------------------
// HTTP server on 8099 — PathServer emulation
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
};

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

// Mirrors PathServer.applyPayload: all fields optional; velocity/tolerance/
// alliance keep previous values when absent, but an absent "tags" key RESETS
// tags to empty (same asymmetry as the real code).
function applyPayload(body) {
  if (Array.isArray(body.start)) {
    robot.start = [0, 1, 2].map((i) => Number(body.start[i]) || 0);
  }
  if (Array.isArray(body.points)) {
    robot.points = body.points.map((p) => [
      Number(p?.[0]) || 0,
      Number(p?.[1]) || 0,
      Number(p?.[2]) || 0,
    ]);
  }
  if ("velocity" in body) robot.velocity = Number(body.velocity) || 0;
  if ("tolerance" in body) robot.tolerance = Number(body.tolerance) || 0;
  if ("alliance" in body) {
    robot.alliance = String(body.alliance ?? "unknown").trim().toLowerCase();
  }
  robot.tags = (Array.isArray(body.tags) ? body.tags : [])
    .map((t) => ({
      index: Math.trunc(Number(t?.index) || 0),
      name: String(t?.name ?? ""),
      value: Number(t?.value) || 0,
    }))
    .sort((a, b) => a.index - b.index);
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (!serverActive()) {
    log("HTTP", `${req.method} ${url.pathname} -> 503 (no OpMode INIT/RUNNING; PathServer would be down)`);
    json(res, 503, { ok: false, error: "PathServer not running (init an OpMode first)" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/points") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        const body = JSON.parse(raw);
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          throw new Error("expected a JSON object");
        }
        applyPayload(body);
        log(
          "HTTP",
          `POST /points -> ok: ${robot.points.length} points, start=(${robot.start.map(round2).join(", ")}), v=${robot.velocity}, tol=${robot.tolerance}, alliance=${robot.alliance}, ${robot.tags.length} tags`
        );
        json(res, 200, {
          ok: true,
          points: robot.points.length + 1,
          velocity: robot.velocity,
          tolerance: robot.tolerance,
          tags: robot.tags.length,
        });
      } catch (err) {
        log("HTTP", `POST /points -> 500 (${err.message})`);
        json(res, 500, { ok: false, error: String(err.message) });
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/pose") {
    json(res, 200, {
      ok: true,
      x: round2(robot.pose.x),
      y: round2(robot.pose.y),
      h: round2(robot.pose.h),
      t: robot.poseT,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/start") {
    json(res, 200, { ok: true, x: robot.start[0], y: robot.start[1], h: robot.start[2] });
    return;
  }

  if (req.method === "GET" && url.pathname === "/config") {
    json(res, 200, {
      ok: true,
      velocity: robot.velocity,
      tolerance: robot.tolerance,
      alliance: robot.alliance,
      points: robot.points.length + 1,
      tags: robot.tags.length,
    });
    return;
  }

  log("HTTP", `${req.method} ${url.pathname} -> 404 (PathServer has no such route)`);
  json(res, 404, { ok: false, error: "not found" });
});

httpServer.listen(HTTP_PORT, () =>
  log("HTTP", `PathServer mock listening on http://localhost:${HTTP_PORT}${ALWAYS_ON ? " (--always-on)" : ""}`)
);

// ---------------------------------------------------------------------------
// WebSocket server on 8000 — FtcDashboard emulation (no dependencies)
// ---------------------------------------------------------------------------
const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const clients = new Set(); // Set<function sendText(str)>

function encodeTextFrame(str) {
  const payload = Buffer.from(str, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function controlFrame(opcode, payload = Buffer.alloc(0)) {
  return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
}

function robotStatusMessage() {
  return {
    type: "RECEIVE_ROBOT_STATUS",
    status: {
      available: true,
      enabled: true,
      activeOpMode: robot.activeOpMode,
      activeOpModeStatus: robot.status,
      batteryVoltage: 12.87,
    },
  };
}

function broadcast(msg) {
  const text = JSON.stringify(msg);
  for (const send of clients) send(text);
}

function handleWsMessage(text, send) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    log("WS", `<- unparseable message: ${text.slice(0, 120)}`);
    return;
  }

  switch (msg.type) {
    case "GET_ROBOT_STATUS":
      send(JSON.stringify(robotStatusMessage()));
      break;

    case "INIT_OP_MODE": {
      const name = String(msg.opModeName ?? "");
      if (!OP_MODE_LIST.includes(name)) {
        log("WS", `<- INIT_OP_MODE "${name}" (not in OpMode list — real dashboard would ignore; accepting anyway)`);
      } else {
        log("WS", `<- INIT_OP_MODE "${name}"`);
      }
      robot.activeOpMode = name;
      robot.status = "INIT";
      robot.driving = false;
      log("SIM", `OpMode "${name}" INIT — PathServer mock is now reachable on :${HTTP_PORT}`);
      broadcast(robotStatusMessage());
      break;
    }

    case "START_OP_MODE":
      log("WS", "<- START_OP_MODE");
      if (robot.status === "INIT") {
        robot.status = "RUNNING";
        if (robot.activeOpMode === "Path Planning Example") startFollowing();
        broadcast(robotStatusMessage());
      } else {
        log("WS", `   ignored (status is ${robot.status}, not INIT)`);
      }
      break;

    case "STOP_OP_MODE":
      log("WS", "<- STOP_OP_MODE");
      robot.status = "STOPPED";
      robot.driving = false;
      log("SIM", `OpMode stopped — PathServer mock is now unreachable${ALWAYS_ON ? " (except --always-on)" : ""}`);
      broadcast(robotStatusMessage());
      break;

    default:
      log("WS", `<- unhandled message type "${msg.type}" (real dashboard would ignore it)`);
  }
}

const wsServer = createServer((req, res) => {
  res.writeHead(426, { "Content-Type": "text/plain" });
  res.end("WebSocket endpoint — connect with ws://");
});

wsServer.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = createHash("sha1").update(key + WS_MAGIC).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  let buf = Buffer.alloc(0);
  const send = (text) => {
    if (!socket.destroyed) socket.write(encodeTextFrame(text));
  };
  clients.add(send);
  log("WS", `client connected (${clients.size} total) — sending OpMode list + status`);
  send(JSON.stringify({ type: "RECEIVE_OP_MODE_LIST", opModeList: OP_MODE_LIST }));
  send(JSON.stringify(robotStatusMessage()));

  const cleanup = () => {
    if (clients.delete(send)) log("WS", `client disconnected (${clients.size} total)`);
    socket.destroy();
  };

  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      if (buf.length < 2) break;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) break;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) break;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) break;
      let payload = buf.subarray(off + maskLen, off + maskLen + len);
      if (masked) {
        const mask = buf.subarray(off, off + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      buf = buf.subarray(off + maskLen + len);

      if (opcode === 0x8) {
        socket.write(controlFrame(0x8));
        cleanup();
        return;
      } else if (opcode === 0x9) {
        socket.write(controlFrame(0xa, payload));
      } else if (opcode === 0x1) {
        handleWsMessage(payload.toString("utf8"), send);
      }
      // opcode 0x2 (binary) / 0x0 (continuation): not used by the webapp
    }
  });

  socket.on("error", cleanup);
  socket.on("close", cleanup);
});

wsServer.listen(WS_PORT, () =>
  log("WS", `FtcDashboard mock listening on ws://localhost:${WS_PORT}/`)
);

log(
  "SIM",
  `mock robot ready. Open the webapp with ?hub=127.0.0.1 — e.g. http://localhost:5173/?hub=127.0.0.1`
);
