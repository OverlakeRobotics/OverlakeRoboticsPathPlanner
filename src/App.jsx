import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * FTC Path Planner – DECODE-ready (v4.1)
 *
 * New in this version:
 * • Interactive PATH PREVIEW with Play / Pause / Stop — robot animates along the path at a set speed
 * • Heading interpolates linearly from the START heading to the SECOND point's target heading (index 1)
 *   across the ENTIRE path (e.g., 0°→90° ⇒ 45° halfway). If fewer than 2 points, it targets the last point's heading.
 * • Custom snap value (in); if >0 it overrides the dropdown. Snap is anchored to field corner (-72,-72)
 * • Robot footprint only on the LAST point while drawing (plus live faded preview when hovering)
 * • Export formatting: one Pose2D per line in the array
 *
 * Coordinates: +X forward (UP on screen), +Y left (LEFT on screen), +heading left (CCW)
 * Pose format: new Pose2D(DistanceUnit.INCH, x, y, AngleUnit.DEGREES, heading)
 */

// ---------- Styling (self-contained CSS) ----------
const styles = `
:root { --bg:#0b1324; --card:#111a33; --accent:#55ccff; --accent-2:#6be675; --muted:#9db0d1; --txt:#e8f0ff; --danger:#ff6b6b; --warn:#ffd166; --shadow:0 10px 24px rgba(0,0,0,.35); }
*{ box-sizing:border-box; }
html,body,#root{ height:100%; }
body{ margin:0; background:radial-gradient(1200px 800px at 80% -20%, #1f2a4a, #0b1324 60%); color:var(--txt); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji"; }
.app{ display:grid; grid-template-columns:340px 1fr 420px; gap:14px; padding:14px; height:100vh; }
.header{ grid-column:1/-1; display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-radius:14px; background:linear-gradient(120deg,#16224a,#0e1733); box-shadow:var(--shadow); }
.brand{ display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:.2px; }
.logo{ width:28px; height:28px; border-radius:8px; background:conic-gradient(from 90deg, #55ccff, #6be675, #55ccff); box-shadow:0 0 0 2px #0b1324 inset; }
.subtle{ color:var(--muted); font-size:12px; }
.card{ background:var(--card); border:1px solid rgba(255,255,255,.06); border-radius:14px; padding:12px; box-shadow:var(--shadow); }
.card h3{ margin:4px 0 10px; font-size:15px; letter-spacing:.3px; }
.controls{ display:grid; gap:10px; }
.row{ display:grid; gap:8px; }
.row.inline{ grid-template-columns:1fr auto; align-items:center; }
.btn{ appearance:none; border:none; background:#1b2a55; color:var(--txt); padding:10px 12px; border-radius:10px; cursor:pointer; font-weight:600; box-shadow:inset 0 -2px 0 rgba(255,255,255,.06); transition:transform .06s ease, filter .15s ease; }
.btn:hover{ filter:brightness(1.1); }
.btn:active{ transform:translateY(1px); }
.btn.primary{ background:linear-gradient(180deg,#5cd2ff,#3fb2e0); color:#092332; }
.btn.green{ background:linear-gradient(180deg,#75ee86,#45c25a); color:#052919; }
.btn.warn{ background:linear-gradient(180deg,#ffd166,#f6b84c); color:#3a2806; }
.btn.danger{ background:linear-gradient(180deg,#ff8686,#ff5c5c); color:#290404; }
.btn.ghost{ background:rgba(255,255,255,.06); }
.input,select,.number{ width:100%; background:#0f1833; color:var(--txt); border:1px solid rgba(255,255,255,.12); padding:9px 10px; border-radius:10px; }
.small{ font-size:12px; color:var(--muted); }
.pill{ display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:999px; padding:4px 8px; }
.grid{ display:grid; gap:10px; }
.grid.two{ grid-template-columns:1fr 1fr; }
.grid.three{ grid-template-columns:1fr 1fr 1fr; }
.badge{ display:inline-block; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); padding:3px 8px; border-radius:999px; font-size:12px; color:var(--muted); }
.canvasWrap{ position:relative; border-radius:16px; overflow:hidden; background:#0b1324; border:1px solid rgba(255,255,255,.1); box-shadow:var(--shadow); }
.canvasTop{ position:absolute; top:10px; left:10px; display:flex; gap:8px; z-index:10; }
.axis{ position:absolute; right:10px; bottom:10px; background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.15); border-radius:10px; padding:6px 8px; font-size:12px; }
.kbd{ padding:2px 6px; border:1px solid rgba(255,255,255,.3); border-bottom-width:2px; border-radius:6px; font-size:12px; }
.codebox{ white-space:pre; background:#0c1430; border:1px solid rgba(255,255,255,.12); border-radius:10px; padding:10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; height:280px; overflow:auto; }
.help{ line-height:1.4; }
footer{ grid-column:1/-1; text-align:center; color:var(--muted); padding-top:4px; font-size:12px; }
hr.sep{ border:none; height:1px; background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.18), rgba(255,255,255,0)); margin:8px 0; }
label small{ color:var(--muted); }
`;

// ---------- Utilities ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toFixed = (n, p = 2) => Number(n).toFixed(p);
const FIELD_EDGE = 72; // inches half-field extent
const num = (v) => (typeof v === 'number' ? v : (isNaN(parseFloat(v)) ? 0 : parseFloat(v)));

function degToRad(d) { return (d * Math.PI) / 180; }
function radToDeg(r) { return (r * 180) / Math.PI; }
function normDeg(d) { let a = d % 360; if (a > 180) a -= 360; if (a <= -180) a += 360; return a; }
function shortestDeltaDeg(a, b) { let d = ((b - a + 540) % 360) - 180; return d; }

// Map world (inches): +x forward (up), +y left (left)  ==> canvas (px): +cx right, +cy down
// canvasX = centerX - y * ppi; canvasY = centerY - x * ppi
function worldToCanvas(x, y, centerX, centerY, ppi) { return { cx: centerX - y * ppi, cy: centerY - x * ppi }; }
function canvasToWorld(cx, cy, centerX, centerY, ppi) { return { x: (centerY - cy) / ppi, y: (centerX - cx) / ppi }; }

function headingFromDelta(dx, dy) { return radToDeg(Math.atan2(dy, dx)); }
function perpendicularHeading(dx, dy, left = true) { const vx = left ? -dy : dy; const vy = left ? dx : -dx; return radToDeg(Math.atan2(vy, vx)); }
function headingVectorCanvas(headingDeg, lengthPx) { const vx = Math.cos(degToRad(headingDeg)); const vy = Math.sin(degToRad(headingDeg)); return { dx: -vy * lengthPx, dy: -vx * lengthPx }; }

function rotateLocalToWorld(localX, localY, headingDeg) { const a = degToRad(headingDeg); return { x: localX * Math.cos(a) - localY * Math.sin(a), y: localX * Math.sin(a) + localY * Math.cos(a) }; }

// Snap to grid anchored at field corner (-72, -72)
function snapToCorner(x, y, step) {
  if (!step || step <= 0) return { x, y };
  const origin = -FIELD_EDGE;
  const sx = origin + Math.round((x - origin) / step) * step;
  const sy = origin + Math.round((y - origin) / step) * step;
  return { x: clamp(sx, -FIELD_EDGE, FIELD_EDGE), y: clamp(sy, -FIELD_EDGE, FIELD_EDGE) };
}

// ---------- Main App ----------
export default function App() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState(720); // px, square
  const fieldInches = 144; // 12 tiles * 24 in
  const ppi = useMemo(() => canvasSize / fieldInches, [canvasSize]);
  const center = useMemo(() => ({ x: canvasSize / 2, y: canvasSize / 2 }), [canvasSize]);

  // Background image (default: crisp 12×12 grid SVG)
  const [bgImg, setBgImg] = useState(null);
  const [bgUrlInput, setBgUrlInput] = useState("");

  // Start pose & points
  const [startPose, setStartPose] = useState({ x: 0, y: 0, h: 0 });
  const [placeStart, setPlaceStart] = useState(false);
  const [points, setPoints] = useState([]); // {x, y, h}

  // Modes & params
  const [mode, setMode] = useState("straight"); // "straight" | "tangent" | "orth-left" | "orth-right"
  const [endHeadingInput, setEndHeadingInput] = useState(0); // for straight mode
  const [velocity, setVelocity] = useState(30);
  const [snapInches, setSnapInches] = useState(1);
  const [customSnap, setCustomSnap] = useState(1); // inches; 0 disables

  // Robot footprint (length along +x forward, width along +y left)
  const [robotL, setRobotL] = useState(18);
  const [robotW, setRobotW] = useState(18);

  // Live hover preview
  const [preview, setPreview] = useState(null); // {x,y,h}

  // PATH PREVIEW animation
  const [playState, setPlayState] = useState("stopped"); // 'stopped' | 'playing' | 'paused'
  const [playSpeed, setPlaySpeed] = useState(12); // inches / second
  const [playDist, setPlayDist] = useState(0); // distance traveled along path (in)
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);

  // Derived: waypoints and total length
  const waypoints = useMemo(() => {
    const sx = num(startPose.x), sy = num(startPose.y);
    return [{ x: sx, y: sy }, ...points.map(p => ({ x: p.x, y: p.y }))];
  }, [startPose, points]);

  const totalLen = useMemo(() => polylineLength(waypoints), [waypoints]);

  // Rotation preview target: heading of the SECOND point (index 1). If fewer points, fallbacks.
  const previewTargetHeading = useMemo(() => {
    if (points.length >= 2) return resolveHeadingAt(1); // heading at second clicked point
    if (points.length === 1) return resolveHeadingAt(0);
    return num(startPose.h);
  }, [points, startPose, mode]);

  // Hi-DPI scaling
  const dpr = Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

  // Default background grid
  useEffect(() => {
    const img = new Image();
    const tiles = 12; const size = 1024; const tile = size / tiles;
    let svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
        `<rect width='100%' height='100%' fill='#0e1733'/>` +
        `<g stroke='#334155' stroke-width='2'>`;
    for (let i = 0; i <= tiles; i++) { const p = i * tile; svg += `<line x1='0' y1='${p}' x2='${size}' y2='${p}'/>`; svg += `<line x1='${p}' y1='0' x2='${p}' y2='${size}'/>`; }
    svg += `</g><g stroke='#64748b' stroke-width='3'>`;
    svg += `<line x1='${size/2}' y1='0' x2='${size/2}' y2='${size}'/>`;
    svg += `<line x1='0' y1='${size/2}' x2='${size}' y2='${size/2}'/>`;
    svg += `</g></svg>`;
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    img.onload = () => setBgImg(img);
  }, []);

  // Animation loop
  useEffect(() => {
    if (playState !== "playing") return;
    const loop = (ts) => {
      if (playState !== "playing") return;
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      setPlayDist(prev => {
        const nd = Math.min(prev + Math.max(0, playSpeed) * dt, totalLen || 0);
        if (nd >= (totalLen || 0)) setPlayState("paused");
        return nd;
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playState, playSpeed, totalLen]);

  // Reset playback when path or start changes
  useEffect(() => { stopPreview(); }, [points, startPose.x, startPose.y, startPose.h]);

  // Draw routine
  useEffect(() => {
    const canvas = canvasRef.current; const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const ctx = canvas.getContext("2d"); const octx = overlay.getContext("2d");

    const w = canvasSize * dpr, h = canvasSize * dpr;
    for (const c of [canvas, overlay]) { c.width = w; c.height = h; c.style.width = `${canvasSize}px`; c.style.height = `${canvasSize}px`; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Base layer: background
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    if (bgImg && bgImg.complete) {
      const scale = Math.max(canvasSize / bgImg.width, canvasSize / bgImg.height);
      const drawW = bgImg.width * scale, drawH = bgImg.height * scale;
      const dx = (canvasSize - drawW) / 2, dy = (canvasSize - drawH) / 2;
      ctx.drawImage(bgImg, dx, dy, drawW, drawH);
    } else { ctx.fillStyle = "#0e1733"; ctx.fillRect(0, 0, canvasSize, canvasSize); }

    // Grid aligned to world (-72..72)
    drawGrid(ctx);

    // Path lines (from START to first point, then between points)
    drawPath(ctx);

    // Overlay: markers, preview, axis, and playback robot
    octx.clearRect(0, 0, canvasSize, canvasSize);
    drawStartMarker(octx);
    drawPointMarkersAndFootprints(octx);
    drawPreview(octx);
    drawPlaybackRobot(octx);
    drawAxis(octx);
  }, [bgImg, canvasSize, dpr, ppi, center, points, startPose, mode, robotL, robotW, preview, playState, playDist, totalLen, previewTargetHeading]);

  function drawGrid(ctx) {
    const tileIn = 24; ctx.save(); ctx.lineWidth = 1.2; ctx.strokeStyle = "#334155";
    for (let y = -FIELD_EDGE; y <= FIELD_EDGE; y += tileIn) { const { cx } = worldToCanvas(0, y, center.x, center.y, ppi); ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvasSize); ctx.stroke(); }
    for (let x = -FIELD_EDGE; x <= FIELD_EDGE; x += tileIn) { const { cy } = worldToCanvas(x, 0, center.x, center.y, ppi); ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(canvasSize, cy); ctx.stroke(); }
    ctx.lineWidth = 2.2; ctx.strokeStyle = "#64748b"; const c = worldToCanvas(0, 0, center.x, center.y, ppi);
    ctx.beginPath(); ctx.moveTo(0, c.cy); ctx.lineTo(canvasSize, c.cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.cx, 0); ctx.lineTo(c.cx, canvasSize); ctx.stroke(); ctx.restore();
  }

  function drawPath(ctx) {
    const sx = num(startPose.x), sy = num(startPose.y);
    if (points.length === 0) return;
    ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = "#5cd2ff"; ctx.lineWidth = 3;
    ctx.beginPath();
    let anchor = worldToCanvas(sx, sy, center.x, center.y, ppi);
    ctx.moveTo(anchor.cx, anchor.cy);
    for (const p of points) { const c = worldToCanvas(p.x, p.y, center.x, center.y, ppi); ctx.lineTo(c.cx, c.cy); }
    ctx.stroke(); ctx.restore();
  }

  function drawArrow(ctx, x1, y1, x2, y2, color = "#6be675") {
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1); const ah = 9;
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(ang - Math.PI / 6) * ah, y2 - Math.sin(ang - Math.PI / 6) * ah);
    ctx.lineTo(x2 - Math.cos(ang + Math.PI / 6) * ah, y2 - Math.sin(ang + Math.PI / 6) * ah);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function drawStartMarker(ctx) {
    const sx = num(startPose.x), sy = num(startPose.y), sh = num(startPose.h);
    const { cx, cy } = worldToCanvas(sx, sy, center.x, center.y, ppi);
    ctx.save(); ctx.fillStyle = "#ffd166"; ctx.strokeStyle = "#ffc14b"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
    const v = headingVectorCanvas(sh, 20); drawArrow(ctx, cx, cy, cx + v.dx, cy + v.dy, "#ffd166");
    ctx.restore();
  }

  function drawRectFootprint(ctx, x, y, headingDeg, L, W, options = {}) {
    const hx = L / 2, hy = W / 2;
    const cornersLocal = [
      { x: +hx, y: +hy }, // front-left
      { x: +hx, y: -hy }, // front-right
      { x: -hx, y: -hy }, // back-right
      { x: -hx, y: +hy }, // back-left
    ];
    const cornersWorld = cornersLocal.map((v) => { const w = rotateLocalToWorld(v.x, v.y, headingDeg); return { x: x + w.x, y: y + w.y }; });
    const cornersCanvas = cornersWorld.map((w) => worldToCanvas(w.x, w.y, center.x, center.y, ppi));

    ctx.save();
    ctx.beginPath(); ctx.moveTo(cornersCanvas[0].cx, cornersCanvas[0].cy);
    for (let i = 1; i < cornersCanvas.length; i++) ctx.lineTo(cornersCanvas[i].cx, cornersCanvas[i].cy);
    ctx.closePath();
    ctx.globalAlpha = options.alpha ?? 0.16; ctx.fillStyle = options.fill ?? "#6be675"; ctx.fill();
    ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = options.stroke ?? "#6be675"; ctx.stroke();
    ctx.restore();
  }

  function drawPointMarkersAndFootprints(ctx) {
    ctx.save();
    points.forEach((p, i) => {
      const h = resolveHeadingAt(i);
      const { cx, cy } = worldToCanvas(p.x, p.y, center.x, center.y, ppi);
      // point dot
      ctx.fillStyle = i === points.length - 1 ? "#ffffff" : "#cbd5e1"; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
      // heading arrow (marker-only)
      const v = headingVectorCanvas(h, 18); drawArrow(ctx, cx, cy, cx + v.dx, cy + v.dy, "#6be675");
    });
    // Only draw the ROBOT outline on the LAST point
    if (points.length > 0) {
      const i = points.length - 1; const p = points[i]; const h = resolveHeadingAt(i);
      drawRectFootprint(ctx, p.x, p.y, h, robotL, robotW, { fill: "#7aa2ff", stroke: "#7aa2ff", alpha: 0.12 });
    }
    ctx.restore();
  }

  function drawPreview(ctx) {
    if (!preview) return;
    const sx = num(startPose.x), sy = num(startPose.y), sh = num(startPose.h);
    const prevAnchor = points.length > 0 ? points[points.length - 1] : { x: sx, y: sy, h: sh };
    const a = worldToCanvas(prevAnchor.x, prevAnchor.y, center.x, center.y, ppi);
    const b = worldToCanvas(preview.x, preview.y, center.x, center.y, ppi);
    // dashed segment
    ctx.save(); ctx.setLineDash([8, 6]); ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy); ctx.stroke(); ctx.setLineDash([]);
    // faded point
    ctx.globalAlpha = 0.8; ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.arc(b.cx, b.cy, 4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    // preview arrow + footprint
    const v = headingVectorCanvas(preview.h, 18); drawArrow(ctx, b.cx, b.cy, b.cx + v.dx, b.cy + v.dy, "#94e2b8");
    drawRectFootprint(ctx, preview.x, preview.y, preview.h, robotL, robotW, { fill: "#94e2b8", stroke: "#94e2b8", alpha: 0.10 });
    ctx.restore();
  }

  function drawPlaybackRobot(ctx) {
    if (playState === "stopped" || points.length === 0 || totalLen <= 0) return;

    // Where are we along the polyline, and which segment is it?
    const g = getSegmentProgress(waypoints, playDist);
    if (!g) return;
    const { pos, i, t } = g; // segment index i, local param t in [0..1]

    // Heading should rotate from hi to hi+1 over THIS segment only
    const h0 = headingAtWaypoint(i);
    const h1 = headingAtWaypoint(i + 1);
    const delta = shortestDeltaDeg(h0, h1);
    const h = normDeg(h0 + delta * t); // constant deg/s because t advances at constant in/s

    // Draw robot footprint + heading arrow
    drawRectFootprint(ctx, pos.x, pos.y, h, robotL, robotW, { fill: "#ffe08a", stroke: "#ffd166", alpha: 0.16 });
    const c = worldToCanvas(pos.x, pos.y, center.x, center.y, ppi);
    const v = headingVectorCanvas(h, 22);
    drawArrow(ctx, c.cx, c.cy, c.cx + v.dx, c.cy + v.dy, "#ffd166");
  }


  // Geometry helpers
  function getSegmentProgress(pts, dist) {
    if (!pts || pts.length < 2) return null;
    const total = polylineLength(pts);
    let d = clamp(dist, 0, total);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (seg <= 1e-6) continue;
      if (d <= seg) {
        const t = seg === 0 ? 0 : d / seg; // 0..1 along current segment
        return { i, t, a, b, segLen: seg, pos: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } };
      } else {
        d -= seg;
      }
    }
    // At end
    const i = pts.length - 2, a = pts[i], b = pts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    return { i, t: 1, a, b, segLen, pos: { x: b.x, y: b.y } };
  }

  function headingAtWaypoint(k) {
    // waypoints = [start, ...points]; waypoint 0 uses startPose.h, waypoint j>0 uses points[j-1] heading
    if (k === 0) return num(startPose.h);
    return resolveHeadingAt(k - 1);
  }

  function getPointAtDistance(pts, dist) {
    const g = getSegmentProgress(pts, dist);
    return g ? { x: g.pos.x, y: g.pos.y, h: headingFromDelta(g.b.x - g.a.x, g.b.y - g.a.y) } : null;
  }

  function polylineLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y); return s; }

  function drawAxis(ctx) {
    ctx.save(); ctx.strokeStyle = "#9db0d1"; ctx.fillStyle = "#9db0d1"; ctx.lineWidth = 2; const x0 = canvasSize - 96, y0 = canvasSize - 52;
    drawArrow(ctx, x0, y0, x0, y0 - 28, "#9db0d1"); ctx.fillText("+X (forward)", x0 - 6, y0 - 34);
    drawArrow(ctx, x0, y0, x0 - 28, y0, "#9db0d1"); ctx.fillText("+Y (left)", x0 - 84, y0 + 14);
    ctx.fillText("+heading left", x0 - 18, y0 + 30); ctx.restore();
  }

  function resolveHeadingAt(i) {
    const p = points[i]; if (mode === "straight") return p.h ?? 0; if (points.length <= 0) return num(startPose.h);
    const prev = i === 0 ? { x: num(startPose.x), y: num(startPose.y) } : points[i - 1];
    const dx = (p.x - prev.x), dy = (p.y - prev.y);
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return num(startPose.h);
    if (mode === "tangent") return headingFromDelta(dx, dy);
    if (mode === "orth-left") return perpendicularHeading(dx, dy, true);
    if (mode === "orth-right") return perpendicularHeading(dx, dy, false);
    return p.h ?? 0;
  }

  function computePreviewHeading(nx, ny) {
    if (mode === "straight") return endHeadingInput;
    const sx = num(startPose.x), sy = num(startPose.y), sh = num(startPose.h);
    const prev = points.length > 0 ? points[points.length - 1] : { x: sx, y: sy, h: sh };
    const dx = nx - prev.x, dy = ny - prev.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 0;
    if (mode === "tangent") return headingFromDelta(dx, dy);
    if (mode === "orth-left") return perpendicularHeading(dx, dy, true);
    if (mode === "orth-right") return perpendicularHeading(dx, dy, false);
    return 0;
  }

  // ---------- Interactions ----------
  const snapStep = () => (customSnap && customSnap > 0) ? customSnap : snapInches;

  function onCanvasMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvasSize / rect.width);
    const cy = (e.clientY - rect.top) * (canvasSize / rect.height);
    const raw = canvasToWorld(cx, cy, center.x, center.y, ppi);

    const snapped = snapToCorner(raw.x, raw.y, snapStep());
    if (placeStart) {
      setPreview({ x: snapped.x, y: snapped.y, h: num(startPose.h) });
    } else {
      const h = computePreviewHeading(snapped.x, snapped.y);
      setPreview({ x: snapped.x, y: snapped.y, h });
    }
  }

  function onCanvasLeave() { setPreview(null); }

  function onCanvasClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvasSize / rect.width);
    const cy = (e.clientY - rect.top) * (canvasSize / rect.height);
    const raw = canvasToWorld(cx, cy, center.x, center.y, ppi);
    const snap = snapToCorner(raw.x, raw.y, snapStep());

    if (placeStart) {
      setStartPose(sp => ({ ...sp, x: snap.x, y: snap.y })); setPlaceStart(false); return;
    }

    const p = { x: snap.x, y: snap.y };
    if (mode === "straight") p.h = endHeadingInput; else p.h = computePreviewHeading(snap.x, snap.y);
    setPoints(prev => [...prev, p]);
  }

  function undoLast() { setPoints(prev => prev.slice(0, -1)); }
  function clearAll() { setPoints([]); }

  // Playback controls
  function playPreview() {
    if (points.length === 0 || totalLen <= 0) return;
    setPlayState("playing");
    lastTsRef.current = 0; // reset frame timer but keep playDist
  }
  function pausePreview() {
    if (playState === "playing") setPlayState("paused");
    else if (playState === "paused") { setPlayState("playing"); lastTsRef.current = 0; }
  }
  function stopPreview() {
    setPlayState("stopped");
    setPlayDist(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }

  // ---------- Background controls ----------
  function handleFile(e) {
    const file = e.target.files?.[0]; if (!file) return; const url = URL.createObjectURL(file); const img = new Image(); img.onload = () => setBgImg(img); img.src = url;
  }
  function loadUrl() { if (!bgUrlInput) return; const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => setBgImg(img); img.src = bgUrlInput; }
  function resetGrid() { setBgImg(null); setPoints([]); stopPreview(); }

  // ---------- Export code ----------
  const code = useMemo(() => {
    const sx = toFixed(num(startPose.x));
    const sy = toFixed(num(startPose.y));
    const sh = toFixed(num(startPose.h));
    const path = points.map((p) => ({ x: toFixed(p.x), y: toFixed(p.y), h: toFixed(p.h ?? 0) }));
    const v = toFixed(velocity, 2);
    if (path.length === 0) return `// Add at least one point to export code.`;
    if (path.length === 1) {
      const p = path[0];
      return `// Starting Pose (reference)
// new Pose2D(DistanceUnit.INCH, ${sx}, ${sy}, AngleUnit.DEGREES, ${sh});

setPositionDrive(
  new Pose2D(DistanceUnit.INCH, ${p.x}, ${p.y}, AngleUnit.DEGREES, ${p.h}),
  ${v}
);`;
    }
    const arr = path
        .map(p => `new Pose2D(DistanceUnit.INCH, ${p.x}, ${p.y}, AngleUnit.DEGREES, ${p.h})`)
        .join(",\n    ");
    return `// Starting Pose (reference)
// new Pose2D(DistanceUnit.INCH, ${sx}, ${sy}, AngleUnit.DEGREES, ${sh});

Pose2D[] path = new Pose2D[]{
    ${arr}
};
setPositionDrive(path, ${v});`;
  }, [points, velocity, startPose]);

  function copyCode() { navigator.clipboard?.writeText(code); }

  // ---------- UI ----------
  return (
      <div className="app">
        <style>{styles}</style>

        <div className="header">
          <div className="brand">
            <div className="logo" />
            <div>
              <div>FTC Path Planner <span className="badge">DECODE</span></div>
              <div className="subtle">+X forward, +Y left, +heading left (CCW). Start→P1 segment shown.</div>
            </div>
          </div>
          <div className="pill"><span>1 tile = 24 in</span><span className="badge">Field: 144" × 144"</span></div>
        </div>

        {/* Left controls */}
        <div className="card controls">
          <h3>Field Background</h3>
          <div className="row">
            <label className="small">Upload an image (.png .jpg .svg)</label>
            <input className="input" type="file" accept="image/*" onChange={handleFile} />
          </div>
          <div className="row inline">
            <input className="input" placeholder="Paste image URL (official DECODE field render works well)" value={bgUrlInput} onChange={(e) => setBgUrlInput(e.target.value)} />
            <button className="btn" onClick={loadUrl}>Load</button>
          </div>
          <div className="grid two">
            <button className="btn ghost" onClick={resetGrid}>Use default grid</button>
            <select className="input" value={canvasSize} onChange={(e) => setCanvasSize(parseInt(e.target.value))}>
              <option value={600}>Canvas: 600×600</option>
              <option value={720}>Canvas: 720×720</option>
              <option value={900}>Canvas: 900×900</option>
            </select>
          </div>

          <hr className="sep" />
          <h3>Start Pose</h3>
          <div className="grid three">
            <div>
              <label>X (in)</label>
              <input
                  className="number"
                  type="text"
                  value={String(startPose.x)}
                  onChange={e => { const v = e.target.value; if (v === "" || v === "-") setStartPose({ ...startPose, x: v }); else { const n = parseFloat(v); if (!isNaN(n)) setStartPose({ ...startPose, x: n }); } }}
              />
            </div>
            <div>
              <label>Y (in)</label>
              <input
                  className="number"
                  type="text"
                  value={String(startPose.y)}
                  onChange={e => { const v = e.target.value; if (v === "" || v === "-") setStartPose({ ...startPose, y: v }); else { const n = parseFloat(v); if (!isNaN(n)) setStartPose({ ...startPose, y: n }); } }}
              />
            </div>
            <div>
              <label>Heading (°)</label>
              <input
                  className="number"
                  type="text"
                  value={String(startPose.h)}
                  onChange={e => { const v = e.target.value; if (v === "" || v === "-") setStartPose({ ...startPose, h: v }); else { const n = parseFloat(v); if (!isNaN(n)) setStartPose({ ...startPose, h: normDeg(n) }); } }}
              />
            </div>
          </div>
          <button className="btn green" onClick={() => setPlaceStart(true)} title="Click the field to place the starting pose">Click to place start</button>
          <div className="small">Tip: preview shows the snapped placement before you click.</div>

          <hr className="sep" />
          <h3>Path Mode</h3>
          <div className="grid two">
            <button onClick={() => setMode("straight")} className={`btn ${mode === "straight" ? "primary" : ""}`}>Straight + End Heading</button>
            <button onClick={() => setMode("tangent")} className={`btn ${mode === "tangent" ? "primary" : ""}`}>Tangent (face forward)</button>
          </div>
          <div className="grid two">
            <button onClick={() => setMode("orth-left")} className={`btn ${mode === "orth-left" ? "primary" : ""}`}>Orthogonal (left)</button>
            <button onClick={() => setMode("orth-right")} className={`btn ${mode === "orth-right" ? "primary" : ""}`}>Orthogonal (right)</button>
          </div>
          {mode === "straight" && (
              <div className="row"><label>Desired end heading for new points (°)</label><input className="number" type="number" value={endHeadingInput} onChange={e => setEndHeadingInput(normDeg(parseFloat(e.target.value)))} /></div>
          )}

          <div className="grid two">
            <div><label>Velocity (in/s)</label><input className="number" type="number" value={velocity} step={1} min={1} max={120} onChange={e => setVelocity(parseFloat(e.target.value))} /></div>
            <div><label>Snap (in)</label><select className="input" value={snapInches} onChange={e => setSnapInches(parseFloat(e.target.value))}><option value={0}>Off</option><option value={0.5}>0.5</option><option value={1}>1</option><option value={2}>2</option><option value={6}>6</option><option value={12}>12</option><option value={24}>24 (tiles)</option></select></div>
          </div>
          <div className="grid two">
            <div>
              <label>Custom snap (in)</label>
              <input className="number" type="number" value={customSnap} step={0.1} min={0} onChange={e => setCustomSnap(parseFloat(e.target.value))} />
              <div className="small">Set to 0 to disable; when &gt;0 it overrides the dropdown.</div>
            </div>
            <div>
              <label>Preview speed (in/s)</label>
              <input className="number" type="number" value={playSpeed} step={1} min={1} max={120} onChange={e => setPlaySpeed(parseFloat(e.target.value))} />
              <div className="small">Playback robot speed along the path.</div>
            </div>
          </div>
          <div className="grid three">
            <button className={`btn ${playState === 'playing' ? 'primary' : ''}`} onClick={playPreview}>▶ Play</button>
            <button className="btn" onClick={pausePreview}>{playState === 'playing' ? '⏸ Pause' : '⏯ Resume'}</button>
            <button className="btn danger" onClick={stopPreview}>⏹ Stop</button>
          </div>
          <div className="small">Progress: {totalLen > 0 ? Math.round((playDist / totalLen) * 100) : 0}% ({toFixed(playDist,1)}in / {toFixed(totalLen,1)}in)</div>

          <hr className="sep" />
          <h3>Robot Footprint</h3>
          <div className="grid two">
            <div><label>Length L (in) <small>(front↔back, +x)</small></label><input className="number" type="number" value={robotL} min={1} max={36} step={0.5} onChange={e => setRobotL(parseFloat(e.target.value))} /></div>
            <div><label>Width W (in) <small>(left↔right, +y)</small></label><input className="number" type="number" value={robotW} min={1} max={36} step={0.5} onChange={e => setRobotW(parseFloat(e.target.value))} /></div>
          </div>

          <div className="grid two" style={{marginTop: 8}}>
            <button className="btn warn" onClick={undoLast}>Undo point</button>
            <button className="btn danger" onClick={clearAll}>Clear path</button>
          </div>

          <div className="help small"><p><span className="kbd">Move</span> the mouse to see a faded preview (snapped to grid anchored at the field corner). <span className="kbd">Click</span> to place.</p></div>
        </div>

        {/* Center canvas */}
        <div className="canvasWrap">
          <div className="canvasTop"><span className="badge">Draw: click to add points</span><span className="badge">(0,0) at center</span></div>
          <canvas
              ref={canvasRef}
              width={canvasSize}
              height={canvasSize}
              onMouseMove={onCanvasMove}
              onMouseLeave={onCanvasLeave}
              onClick={onCanvasClick}
              style={{ display: 'block' }}
          />
          <canvas ref={overlayRef} width={canvasSize} height={canvasSize} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} />
        </div>

        {/* Right export panel */}
        <div className="card">
          <h3>Export: Pose2D & setPositionDrive</h3>
          <div className="grid two" style={{ marginBottom: 8 }}>
            <div className="pill">Pose: <b>new Pose2D(DistanceUnit.INCH, x, y, AngleUnit.DEGREES, heading)</b></div>
            <button className="btn" onClick={copyCode}>Copy</button>
          </div>
          <div className="codebox">{code}</div>
          <hr className="sep" />
          <div className="small help">
            <p><b>Note</b>: The first line in comments shows your starting pose for reference; the path array includes only the clicked points. Coordinates are inches; headings are degrees (CCW/+left).</p>
            <p>Upload a DECODE field render or paste a URL; the image auto-scales to the square canvas while keeping the FTC grid consistent.</p>
          </div>
        </div>

        <footer>Built for FTC path planning • +X forward, +Y left, +heading left • 1 tile = 24" • 12×12 tiles</footer>
      </div>
  );
}
