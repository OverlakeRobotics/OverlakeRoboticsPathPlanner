import React, { useEffect, useMemo, useRef, useState } from "react";
import decodeField from "./assets/decode_field.png";

/**
 * FTC Path Planner – DECODE-ready (v4.3)
 *
 * Changes in this version:
 * • Header and helper texts removed; axis and canvas badges removed
 * • Canvas centered
 * • Default field image from ./assets/decode_field.png (upload supported; URL input removed)
 * • Hold-to-draw for Line segments (continuous points while mouse is down & moving)
 * • Curves: Quadratic Bezier (control click, then end click) and Circular Arc (mid click, then end click)
 * • Grid overlay toggle with adjustable resolution (inches)
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
.grid{ display:grid; gap:10px; }
.grid.two{ grid-template-columns:1fr 1fr; }
.grid.three{ grid-template-columns:1fr 1fr 1fr; }
.badge{ display:inline-block; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); padding:3px 8px; border-radius:999px; font-size:12px; color:var(--muted); }

/* Canvas centering + stacking */
.canvasWrap{ position:relative; border-radius:16px; overflow:hidden; background:#0b1324; border:1px solid rgba(255,255,255,.1); box-shadow:var(--shadow); display:grid; place-items:center; }
.canvasStack{ position:relative; }
.codebox{ white-space:pre; background:#0c1430; border:1px solid rgba(255,255,255,.12); border-radius:10px; padding:10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; height:280px; overflow:auto; }
hr.sep{ border:none; height:1px; background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.18), rgba(255,255,255,0)); margin:8px 0; }
label small{ color:var(--muted); }
footer{ grid-column:1/-1; text-align:center; color:var(--muted); padding-top:4px; font-size:12px; }
`;

// ---------- Utilities ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toFixed = (n, p = 2) => Number(n).toFixed(p);
const FIELD_EDGE = 72; // inches half-field extent
const DEFAULT_GRID_STEP = 24;
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

  // Background image (default: decode field)
  const [bgImg, setBgImg] = useState(null);

  // Start pose & points
  const [startPose, setStartPose] = useState({ x: 0, y: 0, h: 0 });
  const [placeStart, setPlaceStart] = useState(false);
  const [points, setPoints] = useState([]); // {x, y, h} with h frozen at creation
  const [undoStack, setUndoStack] = useState([]); // stack of point batches for undo

  // Modes & params
  const [mode, setMode] = useState("straight"); // "straight" | "tangent" | "orth-left" | "orth-right"
  const [endHeadingInput, setEndHeadingInput] = useState(0); // for straight mode
  const [velocity, setVelocity] = useState(30);
  const [snapOption, setSnapOption] = useState("3"); // preset snap selector
  const [customSnap, setCustomSnap] = useState("1"); // inches when snapOption === 'custom'

  // Robot footprint (length along +x forward, width along +y left)
  const [robotL, setRobotL] = useState(18);
  const [robotW, setRobotW] = useState(18);

  // Live hover preview
  const [preview, setPreview] = useState(null); // {x,y,h}
  const [copied, setCopied] = useState(false);

  // PATH PREVIEW animation
  const [playState, setPlayState] = useState("stopped"); // 'stopped' | 'playing' | 'paused'
  const [playSpeed, setPlaySpeed] = useState(30); // inches / second
  const [playDist, setPlayDist] = useState(0); // distance traveled along path (in)
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);
  const undoHandlerRef = useRef(() => {});
  const copyTimeoutRef = useRef(null);

  // Curve construction state
  const [shapeType, setShapeType] = useState("line"); // 'line' | 'bezier' | 'arc'
  const [bezierTemp, setBezierTemp] = useState(null); // {control:{x,y}}
  const [arcTemp, setArcTemp] = useState(null); // {mid:{x,y}}

  // Grid overlay
  const [showGrid, setShowGrid] = useState(false);
  const [gridStep, setGridStep] = useState(DEFAULT_GRID_STEP); // inches
  const [gridStepEntry, setGridStepEntry] = useState(String(DEFAULT_GRID_STEP));

  // Derived: waypoints and total length
  const waypoints = useMemo(() => {
    const sx = num(startPose.x), sy = num(startPose.y);
    return [{ x: sx, y: sy }, ...points.map(p => ({ x: p.x, y: p.y }))];
  }, [startPose, points]);

  const totalLen = useMemo(() => polylineLength(waypoints), [waypoints]);

  // Hi-DPI scaling
  const dpr = Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

  // Load default DECODE field image
  useEffect(() => {
    const img = new Image();
    img.onload = () => setBgImg(img);
    img.src = decodeField;
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

  useEffect(() => { undoHandlerRef.current = undoLast; }, [undoLast]);

  useEffect(() => () => { if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current); }, []);

  useEffect(() => {
    const handleKeyDown = (evt) => {
      if (!(evt.metaKey || evt.ctrlKey)) return;
      if (evt.altKey) return;
      if (evt.key?.toLowerCase() !== 'z') return;

      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase();
      const isEditable = active && (active.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select');
      if (isEditable) return;

      if (evt.shiftKey) return;

      evt.preventDefault();
      undoHandlerRef.current?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

    // Optional grid overlay
    if (showGrid && gridStep > 0.01) drawGrid(ctx, gridStep);

    // Path lines (from START to first point, then between points)
    drawPath(ctx);

    // Overlay: markers, preview, and playback robot (axes removed)
    octx.clearRect(0, 0, canvasSize, canvasSize);
    drawStartMarker(octx);
    drawPointMarkersAndFootprints(octx);
    drawPreview(octx);
    drawPlaybackRobot(octx);
  }, [bgImg, canvasSize, dpr, ppi, center, points, startPose, mode, robotL, robotW, preview, playState, playDist, totalLen, showGrid, gridStep, shapeType, arcTemp, bezierTemp, placeStart]);

  function drawGrid(ctx, stepIn) {
    const s = Math.max(0.1, stepIn);
    ctx.save(); ctx.lineWidth = 1.2; ctx.strokeStyle = "#334155";
    for (let y = -FIELD_EDGE; y <= FIELD_EDGE + 1e-6; y += s) {
      const { cx } = worldToCanvas(0, y, center.x, center.y, ppi);
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvasSize); ctx.stroke();
    }
    for (let x = -FIELD_EDGE; x <= FIELD_EDGE + 1e-6; x += s) {
      const { cy } = worldToCanvas(x, 0, center.x, center.y, ppi);
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(canvasSize, cy); ctx.stroke();
    }
    ctx.restore();
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
    if (placeStart) return;
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
      const h = num(p.h ?? 0); // FROZEN heading
      const { cx, cy } = worldToCanvas(p.x, p.y, center.x, center.y, ppi);
      // point dot
      ctx.fillStyle = i === points.length - 1 ? "#ffffff" : "#cbd5e1"; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
      // heading arrow (marker-only)
      if (p.showHeading !== false) {
        const v = headingVectorCanvas(h, 18); drawArrow(ctx, cx, cy, cx + v.dx, cy + v.dy, "#6be675");
      }
    });
    // Only draw the ROBOT outline on the LAST point
    if (points.length > 0) {
      const i = points.length - 1; const p = points[i]; const h = num(p.h ?? 0);
      drawRectFootprint(ctx, p.x, p.y, h, robotL, robotW, { fill: "#7aa2ff", stroke: "#7aa2ff", alpha: 0.12 });
    }
    ctx.restore();
  }

  function drawPreview(ctx) {
    const sx = num(startPose.x), sy = num(startPose.y), sh = num(startPose.h);
    const prevAnchor = points.length > 0 ? points[points.length - 1] : { x: sx, y: sy, h: sh };

    if (placeStart && preview) {
      const pos = worldToCanvas(preview.x, preview.y, center.x, center.y, ppi);
      ctx.save();
      ctx.fillStyle = "#ffd166";
      ctx.strokeStyle = "#ffc14b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.cx, pos.cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    const fallbackHeading = () => {
      if (points.length > 0) return num(points[points.length - 1]?.h ?? 0);
      return num(startPose.h);
    };

    const headingFromVectorForMode = (vec) => {
      const mag = Math.hypot(vec.dx ?? 0, vec.dy ?? 0);
      if (mode === "straight") return num(endHeadingInput);
      if (mag <= 1e-6) return fallbackHeading();
      if (mode === "tangent") return headingFromDelta(vec.dx, vec.dy);
      if (mode === "orth-left") return perpendicularHeading(vec.dx, vec.dy, true);
      if (mode === "orth-right") return perpendicularHeading(vec.dx, vec.dy, false);
      return fallbackHeading();
    };

    if (shapeType === "bezier" && bezierTemp) {
      ctx.save();
      const anchorCanvas = worldToCanvas(prevAnchor.x, prevAnchor.y, center.x, center.y, ppi);
      const control = bezierTemp.control;
      const controlCanvas = worldToCanvas(control.x, control.y, center.x, center.y, ppi);

      ctx.fillStyle = "#bae6fd";
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(controlCanvas.cx, controlCanvas.cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (preview) {
        const end = { x: preview.x, y: preview.y };
        const samples = sampleQuadraticBezier(prevAnchor, control, end);
        if (samples && samples.length) {
          ctx.setLineDash([8, 6]);
          ctx.strokeStyle = "#94a3b8";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(anchorCanvas.cx, anchorCanvas.cy);
          for (const s of samples) {
            const c = worldToCanvas(s.x, s.y, center.x, center.y, ppi);
            ctx.lineTo(c.cx, c.cy);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          const b = worldToCanvas(end.x, end.y, center.x, center.y, ppi);
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = "#e2e8f0";
          ctx.beginPath();
          ctx.arc(b.cx, b.cy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;

          const lastSample = samples[samples.length - 1];
          const tangRaw = lastSample?.tangent ?? { dx: end.x - prevAnchor.x, dy: end.y - prevAnchor.y };
          const heading = headingFromVectorForMode(tangRaw);
          const vBezier = headingVectorCanvas(heading, 18);
          drawArrow(ctx, b.cx, b.cy, b.cx + vBezier.dx, b.cy + vBezier.dy, "#94e2b8");
          drawRectFootprint(ctx, preview.x, preview.y, heading, robotL, robotW, { fill: "#94e2b8", stroke: "#94e2b8", alpha: 0.10 });
        }
      }

      ctx.restore();
      return;
    }

    if (shapeType === "arc" && arcTemp) {
      ctx.save();
      const anchorCanvas = worldToCanvas(prevAnchor.x, prevAnchor.y, center.x, center.y, ppi);
      const mid = arcTemp.mid;
      const midCanvas = worldToCanvas(mid.x, mid.y, center.x, center.y, ppi);

      // highlight locked midpoint so users know it's active
      ctx.fillStyle = "#bae6fd";
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(midCanvas.cx, midCanvas.cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (preview) {
        const end = { x: preview.x, y: preview.y };
        const samples = sampleCircularArcThrough(prevAnchor, mid, end);
        if (samples && samples.length) {
          ctx.setLineDash([8, 6]);
          ctx.strokeStyle = "#94a3b8";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(anchorCanvas.cx, anchorCanvas.cy);
          for (const s of samples) {
            const c = worldToCanvas(s.x, s.y, center.x, center.y, ppi);
            ctx.lineTo(c.cx, c.cy);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          const b = worldToCanvas(end.x, end.y, center.x, center.y, ppi);
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = "#e2e8f0";
          ctx.beginPath();
          ctx.arc(b.cx, b.cy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;

          const lastSample = samples[samples.length - 1];
          const tangRaw = lastSample?.tangent ?? { dx: end.x - prevAnchor.x, dy: end.y - prevAnchor.y };
          const heading = headingFromVectorForMode(tangRaw);
          const vArc = headingVectorCanvas(heading, 18);
          drawArrow(ctx, b.cx, b.cy, b.cx + vArc.dx, b.cy + vArc.dy, "#94e2b8");
          drawRectFootprint(ctx, preview.x, preview.y, heading, robotL, robotW, { fill: "#94e2b8", stroke: "#94e2b8", alpha: 0.10 });
        }
      }

      ctx.restore();
      return;
    }

    if (!preview) return;

    const a = worldToCanvas(prevAnchor.x, prevAnchor.y, center.x, center.y, ppi);
    const b = worldToCanvas(preview.x, preview.y, center.x, center.y, ppi);

    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.cx, a.cy);
    ctx.lineTo(b.cx, b.cy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const v = headingVectorCanvas(preview.h, 18);
    drawArrow(ctx, b.cx, b.cy, b.cx + v.dx, b.cy + v.dy, "#94e2b8");
    drawRectFootprint(ctx, preview.x, preview.y, preview.h, robotL, robotW, { fill: "#94e2b8", stroke: "#94e2b8", alpha: 0.10 });
    ctx.restore();
  }

  function drawPlaybackRobot(ctx) {
    if (playState === "stopped" || points.length === 0 || totalLen <= 0) return;

    // Where are we along the polyline, and which segment is it?
    const g = getSegmentProgress(waypoints, playDist);
    if (!g) return;
    const { pos, i, t } = g; // segment index i, local param t in [0..1]

    // Heading rotates from hi to hi+1 over THIS segment only, using frozen headings
    const h0 = headingAtWaypoint(i);
    const h1 = headingAtWaypoint(i + 1);
    const delta = shortestDeltaDeg(h0, h1);
    const h = normDeg(h0 + delta * t);

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
    // waypoint 0 uses startPose.h, waypoint j>0 uses points[j-1].h (frozen)
    if (k === 0) return num(startPose.h);
    const idx = k - 1;
    return num(points[idx]?.h ?? 0);
  }

  function polylineLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y); return s; }

  // Compute heading for PREVIEW / NEW points only (existing points are frozen)
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
  const snapStep = () => {
    if (snapOption === "off") return 0;
    if (snapOption === "custom") {
      const parsedCustom = parseFloat(customSnap);
      return Number.isFinite(parsedCustom) && parsedCustom > 0 ? parsedCustom : 0;
    }
    const preset = parseFloat(snapOption);
    return Number.isFinite(preset) && preset > 0 ? preset : 0;
  };

  function commitGridStepFromInput() {
    const parsed = parseFloat(gridStepEntry);
    if (!gridStepEntry || !Number.isFinite(parsed) || parsed <= 0) {
      setGridStep(DEFAULT_GRID_STEP);
      setGridStepEntry(String(DEFAULT_GRID_STEP));
    } else {
      setGridStep(parsed);
      setGridStepEntry(String(parsed));
    }
  }

  function commitCustomSnap() {
    if (snapOption !== "custom") return;
    const parsed = parseFloat(customSnap);
    if (!customSnap || !Number.isFinite(parsed) || parsed <= 0) {
      setCustomSnap("1");
    } else {
      setCustomSnap(String(parsed));
    }
  }

  function togglePlaceStart() {
    setPreview(null);
    setPlaceStart(prev => {
      const next = !prev;
      if (!prev) {
        clearAll();
      }
      return next;
    });
  }

  function appendPointsBatch(newPoints, meta = {}) {
    if (!newPoints || newPoints.length === 0) return;
    setPoints(prev => [...prev, ...newPoints]);
    const entry = { ...meta, type: meta?.type ?? 'points', count: newPoints.length };
    setUndoStack(prev => [...prev, entry]);
  }

  // Place a single point (click or drag-add)
  function placePointAt(x, y) {
    const p = { x, y, h: computePreviewHeading(x, y), showHeading: true };
    appendPointsBatch([p], { type: 'point' });
    lastDragRef.current = { x, y };
  }

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

  function onMouseDown(e) {
    // Initialize drag baseline
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvasSize / rect.width);
    const cy = (e.clientY - rect.top) * (canvasSize / rect.height);
    const raw = canvasToWorld(cx, cy, center.x, center.y, ppi);
    const snap = snapToCorner(raw.x, raw.y, snapStep());
  }
  function onMouseUp() { setIsDrawing(false); lastDragRef.current = null; }

  function onCanvasClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvasSize / rect.width);
    const cy = (e.clientY - rect.top) * (canvasSize / rect.height);
    const raw = canvasToWorld(cx, cy, center.x, center.y, ppi);
    const snap = snapToCorner(raw.x, raw.y, snapStep());

    if (placeStart) {
      setStartPose(sp => ({ ...sp, x: snap.x, y: snap.y })); setPlaceStart(false); return;
    }

    if (shapeType === "line") {
      placePointAt(snap.x, snap.y);
      return;
    }

    // Curves: need prior anchor (start or last point)
    const anchor = points.length > 0 ? points[points.length - 1] : { x: num(startPose.x), y: num(startPose.y) };

    if (shapeType === "bezier") {
      if (!bezierTemp) {
        setBezierTemp({ control: { x: snap.x, y: snap.y } });
      } else {
        const control = bezierTemp.control;
        const end = { x: snap.x, y: snap.y };
        const samples = sampleQuadraticBezier(anchor, control, end);
        addSampledPointsWithHeading(samples);
        setBezierTemp(null);
      }
      return;
    }

    if (shapeType === "arc") {
      if (!arcTemp) {
        setArcTemp({ mid: { x: snap.x, y: snap.y } });
      } else {
        const mid = arcTemp.mid;
        const end = { x: snap.x, y: snap.y };
        const samples = sampleCircularArcThrough(anchor, mid, end);
        addSampledPointsWithHeading(samples);
        setArcTemp(null);
      }
      return;
    }
  }

  function addSampledPointsWithHeading(samples) {
    if (!samples || samples.length === 0) return;
    const appended = [];
    const sx = num(startPose.x);
    const sy = num(startPose.y);
    const straightHeading = num(endHeadingInput);
    let prevPoint = points.length > 0 ? points[points.length - 1] : { x: sx, y: sy };

    for (let idx = 0; idx < samples.length; idx++) {
      const s = samples[idx];
      let h;
      if (mode === "straight") {
        h = straightHeading;
      } else {
        const fallback = { dx: s.x - prevPoint.x, dy: s.y - prevPoint.y };
        const vec = s.tangent ?? fallback;
        if (mode === "tangent") {
          h = headingFromDelta(vec.dx, vec.dy);
        } else if (mode === "orth-left") {
          h = perpendicularHeading(vec.dx, vec.dy, true);
        } else if (mode === "orth-right") {
          h = perpendicularHeading(vec.dx, vec.dy, false);
        } else {
          h = 0;
        }
      }
      const isLast = idx === samples.length - 1;
      appended.push({ x: s.x, y: s.y, h, showHeading: isLast });
      prevPoint = { x: s.x, y: s.y };
    }

    appendPointsBatch(appended, { type: shapeType });
  }

  // Quadratic Bezier sampling (returns [{x,y,tangent:{dx,dy}}...], excludes anchor)
  function sampleQuadraticBezier(A, C, B) {
    const approxLen = Math.hypot(C.x - A.x, C.y - A.y) + Math.hypot(B.x - C.x, B.y - C.y);
    const spacing = 1.0; // inches per sample
    const n = clamp(Math.ceil(approxLen / spacing), 8, 200);
    const out = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const omt = 1 - t;
      const x = omt * omt * A.x + 2 * omt * t * C.x + t * t * B.x;
      const y = omt * omt * A.y + 2 * omt * t * C.y + t * t * B.y;
      const dx = 2 * omt * (C.x - A.x) + 2 * t * (B.x - C.x);
      const dy = 2 * omt * (C.y - A.y) + 2 * t * (B.y - C.y);
      out.push({ x, y, tangent: { dx, dy } });
    }
    return out;
  }

  // Circular arc through three points: A (anchor), M (mid), B (end)
  function sampleCircularArcThrough(A, M, B) {
    // Circumcenter formula
    const x1 = A.x, y1 = A.y, x2 = M.x, y2 = M.y, x3 = B.x, y3 = B.y;
    const d = 2 * (x1*(y2 - y3) + x2*(y3 - y1) + x3*(y1 - y2));
    if (Math.abs(d) < 1e-6) {
      const vecAB = { dx: B.x - A.x, dy: B.y - A.y };
      const vecAM = { dx: M.x - A.x, dy: M.y - A.y };
      const lenAB = Math.hypot(vecAB.dx, vecAB.dy);
      const lenAM = Math.hypot(vecAM.dx, vecAM.dy);
      const samePoint = lenAB <= 1e-6;
      const axisAligned = Math.abs(M.x - A.x) <= 1e-6 || Math.abs(M.y - A.y) <= 1e-6;

      if (samePoint && axisAligned && lenAM > 1e-6) {
        const radius = lenAM / 2;
        const center = { x: (A.x + M.x) / 2, y: (A.y + M.y) / 2 };
        let orientation = 1;
        if (Math.abs(M.x - A.x) <= 1e-6) {
          orientation = M.y > A.y ? 1 : -1;
        } else if (Math.abs(M.y - A.y) <= 1e-6) {
          orientation = M.x > A.x ? 1 : -1;
        }
        if (orientation === 0) orientation = 1;

        const circumference = 2 * Math.PI * radius;
        const spacing = 1.0;
        const n = clamp(Math.ceil(circumference / spacing), 32, 400);
        const startAngle = Math.atan2(A.y - center.y, A.x - center.x);
        const deltaAngle = orientation * 2 * Math.PI;
        const out = [];
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          if (t >= 1 - 1e-6) break;
          const th = startAngle + deltaAngle * t;
          const x = center.x + radius * Math.cos(th);
          const y = center.y + radius * Math.sin(th);
          const tangent = {
            dx: -Math.sin(th) * radius * orientation,
            dy: Math.cos(th) * radius * orientation,
          };
          out.push({ x, y, tangent });
        }
        return out;
      }

      // Degenerate: fall back to straight line interpolation
      const len = Math.hypot(B.x - A.x, B.y - A.y);
      const n = clamp(Math.ceil(len / 1.0), 8, 200);
      const out = [];
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const x = A.x + (B.x - A.x) * t;
        const y = A.y + (B.y - A.y) * t;
        const dx = (B.x - A.x), dy = (B.y - A.y);
        out.push({ x, y, tangent: { dx, dy } });
      }
      return out;
    }
    const ux = ((x1*x1 + y1*y1)*(y2 - y3) + (x2*x2 + y2*y2)*(y3 - y1) + (x3*x3 + y3*y3)*(y1 - y2)) / d;
    const uy = ((x1*x1 + y1*y1)*(x3 - x2) + (x2*x2 + y2*y2)*(x1 - x3) + (x3*x3 + y3*y3)*(x2 - x1)) / d;
    const O = { x: ux, y: uy };

    const thA = Math.atan2(y1 - uy, x1 - ux);
    const thM = Math.atan2(y2 - uy, x2 - ux);
    const thB = Math.atan2(y3 - uy, x3 - ux);

    // Choose direction (ccw or cw) so that arc from A to B passes through M
    const norm = (a) => (a % (2*Math.PI) + 2*Math.PI) % (2*Math.PI);
    const spanCCW = (norm(thB) - norm(thA) + 2*Math.PI) % (2*Math.PI);
    const mSpanCCW = (norm(thM) - norm(thA) + 2*Math.PI) % (2*Math.PI);
    const passesCCW = mSpanCCW <= spanCCW + 1e-9;

    let delta = passesCCW ? spanCCW : -((norm(thA) - norm(thB) + 2*Math.PI) % (2*Math.PI));
    const r = Math.hypot(x1 - ux, y1 - uy);
    const arcLen = Math.abs(r * delta);
    const n = clamp(Math.ceil(arcLen / 1.0), 8, 240);

    const out = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const th = thA + delta * t;
      const x = ux + r * Math.cos(th);
      const y = uy + r * Math.sin(th);
      // Tangent vector derivative w.r.t theta; sign follows delta direction via th progression
      const dth = delta > 0 ? 1 : -1; // direction for tangent orientation
      const dx = -r * Math.sin(th) * dth;
      const dy =  r * Math.cos(th) * dth;
      out.push({ x, y, tangent: { dx, dy } });
    }
    return out;
  }

  function undoLast() {
    if (bezierTemp) { setBezierTemp(null); setPreview(null); return; }
    if (arcTemp) { setArcTemp(null); setPreview(null); return; }
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    const removeCount = Math.max(0, last?.count ?? 0);
    if (removeCount > 0) {
      setPoints(prev => prev.slice(0, Math.max(0, prev.length - removeCount)));
    }
    setUndoStack(prev => prev.slice(0, -1));
  }

  function clearAll() {
    setPoints([]);
    setUndoStack([]);
    setBezierTemp(null);
    setArcTemp(null);
    setPreview(null);
  }

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
    const file = e.target.files?.[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setBgImg(img);
    img.src = url;
  }
  function resetToDefaultImage() {
    const img = new Image();
    img.onload = () => setBgImg(img);
    img.src = decodeField;
  }

  // ---------- Export code ----------
  const code = useMemo(() => {
    const sx = toFixed(num(startPose.x));
    const sy = toFixed(num(startPose.y));
    const sh = toFixed(num(startPose.h));
    const path = points.map((p) => ({ x: toFixed(p.x), y: toFixed(p.y), h: toFixed(num(p.h ?? 0)) }));
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

  function triggerCopiedFeedback() {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    setCopied(true);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1600);
  }

  function copyCode() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        triggerCopiedFeedback();
      }).catch(() => {
        triggerCopiedFeedback();
      });
    } else {
      triggerCopiedFeedback();
    }
  }

  // ---------- UI ----------
  return (
    <div className="app">
      <style>{styles}</style>

      {/* Left controls */}
      <div className="card controls">
        <h3>Field Background</h3>
        <div className="row">
          <label className="small">Upload an image (.png .jpg .svg)</label>
          <input className="input" type="file" accept="image/*" onChange={handleFile} />
        </div>
        <div className="grid two">
          <button className="btn ghost" onClick={resetToDefaultImage}>Use default field image</button>
          <select className="input" value={canvasSize} onChange={(e) => setCanvasSize(parseInt(e.target.value))}>
            <option value={600}>Canvas: 600×600</option>
            <option value={720}>Canvas: 720×720</option>
            <option value={900}>Canvas: 900×900</option>
          </select>
        </div>

        <hr className="sep" />
        <h3>Grid Overlay</h3>
        <div className="grid two">
          <div>
            <label>Show grid</label>
            <select className="input" value={showGrid ? "on" : "off"} onChange={(e)=> setShowGrid(e.target.value === "on")}>
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </div>
          <div>
            <label>Grid step (in)</label>
            <input
              className="number"
              type="number"
              min={0.25}
              step={0.25}
              value={gridStepEntry}
              onChange={(e) => setGridStepEntry(e.target.value)}
              onBlur={commitGridStepFromInput}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitGridStepFromInput(); e.currentTarget.blur(); } }}
              disabled={!showGrid}
              style={showGrid ? undefined : { opacity: 0.55 }}
            />
          </div>
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
        <button
          className={`btn green ${placeStart ? 'primary' : ''}`}
          onClick={togglePlaceStart}
          title={placeStart ? "Click the field to confirm the start pose" : "Click the field to place the starting pose"}
        >
          {placeStart ? 'Select start on field…' : 'Click to place start'}
        </button>

        <hr className="sep" />
        <h3>Heading Mode</h3>
        <div className="grid two">
          <button onClick={() => setMode("straight")} className={`btn ${mode === "straight" ? "primary" : ""}`}>Straight + End Heading</button>
          <button onClick={() => setMode("tangent")} className={`btn ${mode === "tangent" ? "primary" : ""}`}>Tangent (face forward)</button>
        </div>
        <div className="grid two">
          <button onClick={() => setMode("orth-left")} className={`btn ${mode === "orth-left" ? "primary" : ""}`}>Orthogonal (left)</button>
          <button onClick={() => setMode("orth-right")} className={`btn ${mode === "orth-right" ? "primary" : ""}`}>Orthogonal (right)</button>
        </div>
        {mode === "straight" && (
            <div className="row">
              <label>Desired end heading for new points (°)</label>
              <input
                  className="number"
                  type="text"
                  value={String(endHeadingInput)}
                  onChange={e => { const v = e.target.value; if (v === "" || v === "-") setEndHeadingInput(v); else { const n = parseFloat(v); if (!isNaN(n)) setEndHeadingInput(normDeg(n)); } }}
              />
            </div>
        )}

        <div className="grid two">
          <div><label>Velocity (in/s)</label><input className="number" type="number" value={velocity} step={1} min={1} max={120} onChange={e => setVelocity(parseFloat(e.target.value))} /></div>
          <div>
            <label>Snap (in)</label>
            <select
              className="input"
              value={snapOption}
              onChange={(e) => setSnapOption(e.target.value)}
            >
              <option value="off">Off</option>
              <option value="0.5">0.5</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="6">6</option>
              <option value="12">12</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>
        <div className="grid two">
          <div>
            <label>Custom snap (in)</label>
            <input
              className="number"
              type="number"
              value={customSnap}
              step={0.1}
              min={0}
              disabled={snapOption !== 'custom'}
              onChange={e => setCustomSnap(e.target.value)}
              onBlur={commitCustomSnap}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitCustomSnap(); e.currentTarget.blur(); } }}
              style={snapOption === 'custom' ? undefined : { opacity: 0.55 }}
              title={snapOption === 'custom' ? 'Enter snap step used when placing points' : 'Select Custom in the dropdown to edit'}
            />
          </div>
          <div>
            <label>Preview speed (in/s)</label>
            <input className="number" type="number" value={playSpeed} step={1} min={1} max={120} onChange={e => setPlaySpeed(parseFloat(e.target.value))} />
          </div>
        </div>
        <div className="grid three">
          <button className={`btn ${playState === 'playing' ? 'primary' : ''}`} onClick={playPreview}>▶ Play</button>
          <button className="btn" onClick={pausePreview}>{playState === 'playing' ? '⏸ Pause' : '⏯ Resume'}</button>
          <button className="btn danger" onClick={stopPreview}>⏹ Stop</button>
        </div>
        <div className="small">Progress: {totalLen > 0 ? Math.round((playDist / totalLen) * 100) : 0}% ({toFixed(playDist,1)}in / {toFixed(totalLen,1)}in)</div>
      </div>

      {/* Center canvas */}
      <div className="canvasWrap">
        <div
          className="canvasStack"
          style={{ width: `${canvasSize}px`, height: `${canvasSize}px` }}
        >
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
      </div>

      {/* Right export / tools panel */}
      <div className="card">
        <div className="row inline" style={{ marginBottom: 8 }}>
          <button className={`btn ${copied ? 'primary' : ''}`} onClick={copyCode}>{copied ? 'Copied!' : 'Copy'}</button>
          <div />
        </div>
        <div className="codebox">{code}</div>

        <hr className="sep" />
        <h3>Segment Type</h3>
        <div className="grid three">
          <button className={`btn ${shapeType==='line' ? 'primary':''}`} onClick={()=>{ setShapeType('line'); setBezierTemp(null); setArcTemp(null); }}>Line</button>
          <button className={`btn ${shapeType==='bezier' ? 'primary':''}`} onClick={()=>{ setShapeType('bezier'); setArcTemp(null); }}>Quadratic Bezier</button>
          <button className={`btn ${shapeType==='arc' ? 'primary':''}`} onClick={()=>{ setShapeType('arc'); setBezierTemp(null); }}>Circular Arc</button>
        </div>

        <hr className="sep" />
        <h3>Robot Footprint</h3>
        <div className="grid two">
          <div><label>Length L (in) <small>(+x)</small></label><input className="number" type="number" value={robotL} min={1} max={36} step={0.5} onChange={e => setRobotL(parseFloat(e.target.value))} /></div>
          <div><label>Width W (in) <small>(+y)</small></label><input className="number" type="number" value={robotW} min={1} max={36} step={0.5} onChange={e => setRobotW(parseFloat(e.target.value))} /></div>
        </div>

        <div className="grid two" style={{marginTop: 8}}>
          <button className="btn warn" onClick={undoLast}>Undo</button>
          <button className="btn danger" onClick={clearAll}>Clear path</button>
        </div>
      </div>

      <footer>FTC path planning • +X forward, +Y left, +heading left • 1 tile = 24" • 12×12 tiles</footer>
    </div>
  );
}
