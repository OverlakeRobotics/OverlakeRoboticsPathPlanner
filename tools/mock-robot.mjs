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
// Accepts the version-2 upload payload (start, points, alliance, segments,
// tags with {index, segment, name, value}). The Pedro Pathing follower on the
// real robot builds its path from "segments"; this mock only validates them
// and drives the sampled "points" with a simple point-advance loop. Tags fire
// like the real OpMode: "velocity" is a percent of the simulated max speed,
// "pause" holds position, anything else is logged.
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
// Motion limits the robot reports in GET /config (and echoes on POST /points)
// so the webapp's playback estimate uses real numbers. maxAccelInS2 is null
// when the robot does not measure it; the webapp then falls back to Setup.
const ROBOT_LIMITS = {
  maxSpeedInS: 40,
  maxStrafeSpeedInS: 34,
  maxDecelInS2: 30,
  maxAccelInS2: null,
};
// Simulated drivetrain: "velocity" tags scale this max speed (percent).
const SIM_MAX_SPEED_IN_S = ROBOT_LIMITS.maxSpeedInS;
const ADVANCE_TOL_IN = 1.0;
const SEGMENT_TYPES = new Set(["line", "bezier", "arc", "free"]);
const HEADING_MODES = new Set(["straight", "tangent"]);

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
  version: 0,
  start: [0, 0, 0],
  points: [], // [[x, y, h], ...] dense samples, start excluded
  segments: [], // [{type, headingMode, end, control?, mid?, samples?}]
  alliance: "unknown",
  tags: [], // [{index, segment, name, value}] sorted by index
  // follower
  driving: false,
  currentPoint: 0,
  speedPct: 100,
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
  robot.speedPct = 100;
  robot.tagPtr = 0;
  robot.pauseUntil = 0;
  robot.driving = true;
  robot.driveStartedAt = now();
  log(
    "SIM",
    `following path: ${robot.segments.length} segments / ${robot.points.length} points at ${SIM_MAX_SPEED_IN_S} in/s max, ${robot.tags.length} tags`
  );
}

const driveVelocity = () => (SIM_MAX_SPEED_IN_S * robot.speedPct) / 100;

// "velocity" tag values are percent of max speed. Legacy files may still hold
// a 0-1 fraction; anything above 1 is taken as a percent (same as the robot).
const velocityTagToPercent = (value) => {
  const n = Number(value) || 0;
  const pct = n > 1 ? n : n * 100;
  return Math.max(0, Math.min(100, pct));
};

function fireTags() {
  while (
    robot.tagPtr < robot.tags.length &&
    robot.tags[robot.tagPtr].index <= robot.currentPoint
  ) {
    const tag = robot.tags[robot.tagPtr++];
    const where = `point ${robot.currentPoint} (segment ${tag.segment})`;
    if (tag.name === "velocity") {
      robot.speedPct = velocityTagToPercent(tag.value);
      if (robot.speedPct <= 0) {
        log("SIM", `tag velocity=${tag.value} fired at ${where} — 0% of max speed, robot will not move`);
      } else {
        log("SIM", `tag velocity=${tag.value} fired at ${where} — now ${robot.speedPct}% of max (${round2(driveVelocity())} in/s)`);
      }
    } else if (tag.name === "pause") {
      robot.pauseUntil = now() + tag.value * 1000;
      log("SIM", `tag pause=${tag.value}s fired at ${where}`);
    } else {
      log(
        "SIM",
        `tag "${tag.name}"=${tag.value} fired at ${where} (custom tag — your OpMode defines what this does)`
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
  const tolEff = ADVANCE_TOL_IN;
  let target = robot.points[robot.currentPoint];
  let dist = Math.hypot(target[0] - robot.pose.x, target[1] - robot.pose.y);

  // advance waypoints while inside tolerance (same as the real follower)
  while (dist < tolEff && robot.currentPoint < robot.points.length - 1) {
    robot.currentPoint += 1;
    target = robot.points[robot.currentPoint];
    dist = Math.hypot(target[0] - robot.pose.x, target[1] - robot.pose.y);
    fireTags();
  }

  // translate toward target at the current percent of max speed
  const step = Math.max(driveVelocity(), 0) * dt;
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

const num3 = (p) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0, h: Number(p?.h) || 0 });
const num2 = (p) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0 });

// Validates one entry of "segments" the way the robot-side parser would.
// Throws on anything the Pedro follower could not build a path from.
function parseSegment(raw, i) {
  if (typeof raw !== "object" || raw === null) throw new Error(`segments[${i}] is not an object`);
  const type = String(raw.type ?? "");
  if (!SEGMENT_TYPES.has(type)) throw new Error(`segments[${i}] has unknown type "${type}"`);
  const headingMode = String(raw.headingMode ?? "");
  if (!HEADING_MODES.has(headingMode)) {
    throw new Error(`segments[${i}] headingMode must be "straight" or "tangent" (got "${raw.headingMode}")`);
  }
  if (typeof raw.end !== "object" || raw.end === null) throw new Error(`segments[${i}] is missing "end"`);
  if (type === "bezier" && (typeof raw.control !== "object" || raw.control === null)) {
    throw new Error(`segments[${i}] (bezier) is missing "control"`);
  }
  if (type === "arc" && (typeof raw.mid !== "object" || raw.mid === null)) {
    throw new Error(`segments[${i}] (arc) is missing "mid"`);
  }
  const samples = Array.isArray(raw.samples) ? raw.samples.map(num3) : [];
  if (type === "free" && samples.length === 0) {
    throw new Error(`segments[${i}] (free) needs "samples"`);
  }
  return {
    type,
    headingMode,
    end: num3(raw.end),
    control: type === "bezier" ? num2(raw.control) : undefined,
    mid: type === "arc" ? num2(raw.mid) : undefined,
    samples,
  };
}

// Mirrors the robot-side applyPayload: start/points/segments/alliance keep
// previous values when absent, but an absent "tags" key RESETS tags to empty.
function applyPayload(body) {
  robot.version = Number(body.version) || 1;
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
  if (Array.isArray(body.segments)) {
    robot.segments = body.segments.map(parseSegment);
  } else if (Array.isArray(body.points)) {
    // New points without segments: drop the stale segments rather than pair
    // them with a path they no longer describe.
    robot.segments = [];
    if (robot.version >= 2) {
      log("HTTP", 'warning: version 2 payload without "segments" — Pedro follower would have no path to build');
    }
  }
  if ("velocity" in body || "tolerance" in body) {
    log("HTTP", 'warning: payload still has global "velocity"/"tolerance" — ignored (removed in version 2)');
  }
  if ("alliance" in body) {
    robot.alliance = String(body.alliance ?? "unknown").trim().toLowerCase();
  }
  robot.tags = (Array.isArray(body.tags) ? body.tags : [])
    .map((t, i) => {
      const index = Math.trunc(Number(t?.index) || 0);
      const hasSegment = Number.isFinite(Number(t?.segment));
      if (!hasSegment) log("HTTP", `warning: tags[${i}] "${t?.name}" has no "segment" field (legacy tag)`);
      // start-pose tags carry segment -1; everything else names the segment it ends.
      const segment = hasSegment ? Math.trunc(Number(t.segment)) : index === 0 ? -1 : index - 1;
      return { index, segment, name: String(t?.name ?? ""), value: Number(t?.value) || 0 };
    })
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
        const segSummary = robot.segments
          .map((s) => `${s.type}/${s.headingMode}`)
          .join(", ");
        log(
          "HTTP",
          `POST /points -> ok: v${robot.version}, ${robot.segments.length} segments [${segSummary}], ${robot.points.length} points, start=(${robot.start.map(round2).join(", ")}), alliance=${robot.alliance}, ${robot.tags.length} tags`
        );
        for (const t of robot.tags) {
          log("HTTP", `   tag "${t.name}"=${t.value} @ point ${t.index}, segment ${t.segment}`);
        }
        json(res, 200, {
          ok: true,
          version: robot.version,
          points: robot.points.length + 1,
          segments: robot.segments.length,
          tags: robot.tags.length,
          robot: ROBOT_LIMITS,
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
      version: robot.version,
      alliance: robot.alliance,
      points: robot.points.length + 1,
      segments: robot.segments.length,
      tags: robot.tags.length,
      robot: ROBOT_LIMITS,
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
