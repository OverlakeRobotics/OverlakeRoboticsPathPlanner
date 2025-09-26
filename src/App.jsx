import React, { useEffect, useMemo, useRef, useState } from "react";
import decodeField from "./assets/decode_field.png";

/**
 * FTC Path Planner – DECODE-ready (v4.5)
 *
 * This version:
 * • Tags: no index field; attaches to most recent point. Added to copy/export and upload.
 * • Snap (in) remains for placement only; NOT exported or uploaded.
 * • Tolerance (in) retained; included in upload + code export.
 * • Play/Pause/Stop on right panel; Tag input at bottom of left panel.
 * • Left/right panels are scrollable to fit viewport; visual spacing polished.
 */

const styles = `
:root{
  --bg:#0b1324; --panel:#0f1833; --card:#111a33; --edge:#223054;
  --txt:#e8f0ff; --muted:#9db0d1;
  --accent:#55ccff; --ok:#6be675; --warn:#ffd166; --danger:#ff6b6b;
  --shadow:0 12px 28px rgba(0,0,0,.35);
}
*{ box-sizing:border-box; }
html,body,#root{ height:100%; }
body{
  margin:0;
  color:var(--txt);
  background:
    radial-gradient(1200px 800px at 80% -20%, #1f2a4a 0%, #0b1324 65%) fixed,
    linear-gradient(#0b1324,#0b1324) fixed;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial;
}

/* --- App grid --- */
.app{
  height:100vh;
  display:grid;
  grid-template-columns: 360px minmax(520px,1fr) 420px;
  gap:14px;
  padding:14px;
}
@media (max-width: 1200px){
  .app{ grid-template-columns: 320px 1fr 380px; }
}
@media (max-width: 980px){
  .app{ grid-template-columns: 1fr; grid-auto-rows:minmax(0,1fr); }
}

/* --- Panels --- */
.panel{
  background:var(--card);
  border:1px solid rgba(255,255,255,.06);
  border-radius:14px;
  box-shadow:var(--shadow);
  display:flex; flex-direction:column;
  min-height:0; /* important for scroll children */
}
.panel .scroll{
  overflow:auto;
  padding:14px;
  display:grid;
  gap:14px;
  min-height:0;
}
.panel .sticky{
  position:sticky; top:0; z-index:5;
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  background:linear-gradient(180deg, rgba(17,26,51,.98), rgba(17,26,51,.9));
  border-bottom:1px solid rgba(255,255,255,.06);
  padding:10px 14px;
  border-radius:14px 14px 0 0;
  backdrop-filter: blur(4px);
}

/* --- Sections --- */
.section{ display:grid; gap:10px; }
.section h3{
  margin:0;
  font-size:14px; letter-spacing:.25px; font-weight:700;
  color:#d9e6ff;
}
hr.sep{
  height:1px; border:none;
  background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.18), rgba(255,255,255,0));
  margin:2px 0;
}

/* --- Controls --- */
.row{ display:grid; gap:8px; }
.inline{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.grid{ display:grid; gap:10px; }
.grid.two{ grid-template-columns:1fr 1fr; }
.grid.three{ grid-template-columns:repeat(3,1fr); }

.input, .number, select, textarea{
  width:100%; background:var(--panel); color:var(--txt);
  border:1px solid rgba(255,255,255,.12);
  padding:9px 10px; border-radius:10px;
}
textarea.codebox{
  height:260px; resize:vertical; min-height:200px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
  background:#0c1430; border-color:rgba(255,255,255,.14);
}

/* Buttons */
.btn{
  appearance:none; border:none; cursor:pointer; font-weight:700;
  padding:10px 12px; border-radius:10px; color:var(--txt);
  background:#1b2a55; box-shadow:inset 0 -2px 0 rgba(255,255,255,.05);
  transition: transform .06s ease, filter .15s ease;
}
.btn:hover{ filter:brightness(1.08); }
.btn:active{ transform:translateY(1px); }
.btn.primary{ background:linear-gradient(180deg,#5cd2ff,#3fb2e0); color:#062034; }
.btn.ok{ background:linear-gradient(180deg,#7df19a,#44c55c); color:#062719; }
.btn.warn{ background:linear-gradient(180deg,#ffd166,#f6b84c); color:#3a2806; }
.btn.danger{ background:linear-gradient(180deg,#ff8686,#ff5c5c); color:#2b0707; }
.btn.ghost{ background:rgba(255,255,255,.06); }

/* Badges / micro */
.small{ font-size:12px; color:var(--muted); }
.badge{ display:inline-flex; align-items:center; gap:6px; font-size:12px; color:#cbd7f3; }
.dot{ width:8px; height:8px; border-radius:50%; background:#5cd2ff; display:inline-block; }

/* --- Canvas --- */
.canvasWrap{
  background:#0b1324; border:1px solid rgba(255,255,255,.08);
  border-radius:16px; box-shadow:var(--shadow);
  min-height:0; display:grid; place-items:center; overflow:hidden;
}
.canvasStack{ position:relative; }

/* --- Path stats card --- */
.stats{
  display:grid; grid-template-columns:repeat(3,1fr); gap:8px;
}
.stat{
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.08);
  border-radius:10px; padding:10px;
  display:grid; gap:4px;
}
.stat .k{ font-size:11px; color:var(--muted); }
.stat .v{ font-weight:800; }

/* --- Legend --- */
.legend{
  display:flex; gap:10px; flex-wrap:wrap;
}
.legend .chip{
  display:flex; align-items:center; gap:8px;
  background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.08);
  padding:6px 10px; border-radius:999px;
  font-size:12px; color:#d6e3ff;
}

/* --- Scrollbars (WebKit) --- */
.scroll::-webkit-scrollbar,
textarea.codebox::-webkit-scrollbar{ width:12px; height:12px; }
.scroll::-webkit-scrollbar-track,
textarea.codebox::-webkit-scrollbar-track{
  background:var(--card); border-radius:10px; border:1px solid rgba(255,255,255,.06);
}
.scroll::-webkit-scrollbar-thumb,
textarea.codebox::-webkit-scrollbar-thumb{
  background:linear-gradient(180deg,#3a4a7a,#27345a);
  border-radius:10px; border:2px solid var(--card);
}
.scroll::-webkit-scrollbar-thumb:hover,
textarea.codebox::-webkit-scrollbar-thumb:hover{ background:#3f5493; }

/* --- Scrollbars (Firefox) --- */
.scroll, textarea.codebox { scrollbar-width: thin; scrollbar-color: #3a4a7a var(--card); }

/* --- Footer --- */
footer{
  grid-column:1/-1; text-align:center; color:var(--muted); font-size:12px; padding-top:6px;
}

/* --- Responsive helpers --- */
@media (max-width:980px){
  .stats{ grid-template-columns:repeat(2,1fr); }
}
`;


// ---------- Utilities ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toFixed = (n, p=2) => Number(n).toFixed(p);
const FIELD_EDGE = 72;
const DEFAULT_GRID_STEP = 24;
const num = (v) => (typeof v === "number" ? v : (isNaN(parseFloat(v)) ? 0 : parseFloat(v)));

function degToRad(d){ return (d*Math.PI)/180; }
function radToDeg(r){ return (r*180)/Math.PI; }
function normDeg(d){ let a=d%360; if(a>180)a-=360; if(a<=-180)a+=360; return a; }
function shortestDeltaDeg(a,b){ return ((b-a+540)%360)-180; }

function worldToCanvas(x,y,cx,cy,ppi){ return { cx: cx - y*ppi, cy: cy - x*ppi }; }
function canvasToWorld(cx,cy,cx0,cy0,ppi){ return { x: (cy0 - cy)/ppi, y: (cx0 - cx)/ppi }; }
function headingFromDelta(dx,dy){ return radToDeg(Math.atan2(dy,dx)); }
function perpendicularHeading(dx,dy,left=true){ const vx=left?-dy:dy, vy=left?dx:-dx; return radToDeg(Math.atan2(vy,vx)); }
function headingVectorCanvas(h,len){ const vx=Math.cos(degToRad(h)), vy=Math.sin(degToRad(h)); return { dx: -vy*len, dy: -vx*len }; }
function rotateLocalToWorld(lx,ly,h){ const a=degToRad(h); return { x: lx*Math.cos(a)-ly*Math.sin(a), y: lx*Math.sin(a)+ly*Math.cos(a) }; }

function snapToCorner(x,y,step){
  if(!step||step<=0) return {x,y};
  const o=-FIELD_EDGE;
  const sx=o+Math.round((x-o)/step)*step;
  const sy=o+Math.round((y-o)/step)*step;
  return { x: clamp(sx,-FIELD_EDGE,FIELD_EDGE), y: clamp(sy,-FIELD_EDGE,FIELD_EDGE) };
}

// ---------- Main ----------
export default function App(){
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState(720);
  const fieldInches = 144;
  const ppi = useMemo(()=>canvasSize/fieldInches,[canvasSize]);
  const center = useMemo(()=>({x:canvasSize/2,y:canvasSize/2}),[canvasSize]);
  const dpr = Math.max(1, typeof window!=="undefined" ? window.devicePixelRatio||1 : 1);

  // Background
  const [bgImg, setBgImg] = useState(null);

  // Start & points
  const [startPose, setStartPose] = useState({x:0,y:0,h:0});
  const [placeStart, setPlaceStart] = useState(false);
  const [points, setPoints] = useState([]);
  const [undoStack, setUndoStack] = useState([]);

  // Tags (auto-index = most recent point)
  const [tags, setTags] = useState([]); // { index, name, value }
  const [tagName, setTagName] = useState("");
  const [tagValue, setTagValue] = useState(0);

  // Modes & params
  const [mode, setMode] = useState("straight");
  const [endHeadingInput, setEndHeadingInput] = useState(0);
  const [velocity, setVelocity] = useState(30);
  const [snapInches, setSnapInches] = useState(1);   // for placement only
  const [tolerance, setTolerance] = useState(0.5);   // exported + uploaded

  // Robot footprint
  const [robotL, setRobotL] = useState(18);
  const [robotW, setRobotW] = useState(18);

  // Live hover
  const [preview, setPreview] = useState(null);
  const [copied, setCopied] = useState(false);

  // Playback
  const [playState, setPlayState] = useState("stopped");
  const [playSpeed, setPlaySpeed] = useState(30);
  const [playDist, setPlayDist] = useState(0);
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);

  // Upload feedback
  const [uploadStatus, setUploadStatus] = useState("idle"); // idle | sending | ok | fail
  const uploadTimerRef = useRef(null);

  // Curves
  const [shapeType, setShapeType] = useState("line");
  const [bezierTemp, setBezierTemp] = useState(null);
  const [arcTemp, setArcTemp] = useState(null);

  // Grid
  const [showGrid, setShowGrid] = useState(false);
  const [gridStep, setGridStep] = useState(DEFAULT_GRID_STEP);
  const [gridStepEntry, setGridStepEntry] = useState(String(DEFAULT_GRID_STEP));

  // state
  const [livePose, setLivePose] = useState(null);

  // poll the hub for /pose
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("http://192.168.43.1:8099/pose", { cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          if (!stop && j && j.ok) setLivePose({ x:j.x, y:j.y, h:j.h, t:j.t });
        }
      } catch {}
      if (!stop) setTimeout(tick, 75); // ~13 Hz (tune: 50–100ms)
    };
    tick();
    return () => { stop = true; };
  }, []);


  const waypoints = useMemo(()=>{
    const sx=num(startPose.x), sy=num(startPose.y);
    return [{x:sx,y:sy}, ...points.map(p=>({x:p.x,y:p.y}))];
  },[startPose,points]);

  const totalLen = useMemo(()=>polylineLength(waypoints),[waypoints]);

  // Load default field
  useEffect(()=>{
    const img = new Image();
    img.onload = ()=>setBgImg(img);
    img.src = decodeField;
  },[]);

  // Playback loop
  useEffect(()=>{
    if (playState!=="playing") return;
    const loop=(ts)=>{
      if (playState!=="playing") return;
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current)/1000;
      lastTsRef.current = ts;
      setPlayDist(prev=>{
        const nd = Math.min(prev + Math.max(0,playSpeed)*dt, totalLen||0);
        if (nd >= (totalLen||0)) setPlayState("paused");
        return nd;
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return ()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); };
  },[playState, playSpeed, totalLen]);

  // Reset playback when geometry changes
  useEffect(()=>{ stopPreview(); },[points, startPose.x, startPose.y, startPose.h]);

  // Cleanup upload timer
  useEffect(()=>()=>{ if(uploadTimerRef.current) clearTimeout(uploadTimerRef.current); },[]);

  // Draw
  useEffect(()=>{
    const canvas=canvasRef.current, overlay=overlayRef.current;
    if(!canvas || !overlay) return;
    const ctx=canvas.getContext("2d"), octx=overlay.getContext("2d");

    const w=canvasSize*dpr, h=canvasSize*dpr;
    for(const c of [canvas,overlay]){ c.width=w; c.height=h; c.style.width=`${canvasSize}px`; c.style.height=`${canvasSize}px`; }
    ctx.setTransform(dpr,0,0,dpr,0,0); octx.setTransform(dpr,0,0,dpr,0,0);

    // BG
    ctx.clearRect(0,0,canvasSize,canvasSize);
    if(bgImg && bgImg.complete){
      const scale=Math.max(canvasSize/bgImg.width, canvasSize/bgImg.height);
      const dw=bgImg.width*scale, dh=bgImg.height*scale;
      const dx=(canvasSize-dw)/2, dy=(canvasSize-dh)/2;
      ctx.drawImage(bgImg, dx, dy, dw, dh);
    } else { ctx.fillStyle="#0e1733"; ctx.fillRect(0,0,canvasSize,canvasSize); }

    // Grid
    if(showGrid && gridStep>0.01) drawGrid(ctx, gridStep);

    // Path
    drawPath(ctx);

    // Overlay
    octx.clearRect(0,0,canvasSize,canvasSize);
    drawStartMarker(octx);
    drawPointMarkersAndFootprints(octx);
    drawPreview(octx);
    drawPlaybackRobot(octx);
    if (livePose) {
      drawRectFootprint(octx, livePose.x, livePose.y, livePose.h, robotL, robotW, {
        fill: "#ff6ad5",
        stroke: "#ff6ad5",
        alpha: 0.18
      });
    }
  },[bgImg, canvasSize, dpr, ppi, center, points, startPose, mode, robotL, robotW, preview, playState, playDist, totalLen, showGrid, gridStep, shapeType, arcTemp, bezierTemp, placeStart]);

  function drawGrid(ctx, step){
    const s=Math.max(0.1, step);
    ctx.save(); ctx.lineWidth=1.2; ctx.strokeStyle="#334155";
    for(let y=-FIELD_EDGE;y<=FIELD_EDGE+1e-6;y+=s){
      const {cx}=worldToCanvas(0,y,center.x,center.y,ppi);
      ctx.beginPath(); ctx.moveTo(cx,0); ctx.lineTo(cx,canvasSize); ctx.stroke();
    }
    for(let x=-FIELD_EDGE;x<=FIELD_EDGE+1e-6;x+=s){
      const {cy}=worldToCanvas(x,0,center.x,center.y,ppi);
      ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(canvasSize,cy); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPath(ctx){
    const sx=num(startPose.x), sy=num(startPose.y);
    if(points.length===0) return;
    ctx.save(); ctx.lineJoin="round"; ctx.lineCap="round"; ctx.strokeStyle="#5cd2ff"; ctx.lineWidth=3;
    ctx.beginPath();
    let a=worldToCanvas(sx,sy,center.x,center.y,ppi); ctx.moveTo(a.cx,a.cy);
    for(const p of points){ const c=worldToCanvas(p.x,p.y,center.x,center.y,ppi); ctx.lineTo(c.cx,c.cy); }
    ctx.stroke(); ctx.restore();
  }

  function drawArrow(ctx,x1,y1,x2,y2,color="#6be675"){
    ctx.save(); ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    const ang=Math.atan2(y2-y1,x2-x1), ah=9;
    ctx.beginPath(); ctx.moveTo(x2,y2);
    ctx.lineTo(x2-Math.cos(ang-Math.PI/6)*ah, y2-Math.sin(ang-Math.PI/6)*ah);
    ctx.lineTo(x2-Math.cos(ang+Math.PI/6)*ah, y2-Math.sin(ang+Math.PI/6)*ah);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function drawStartMarker(ctx){
    if(placeStart) return;
    const sx=num(startPose.x), sy=num(startPose.y), sh=num(startPose.h);
    const {cx,cy}=worldToCanvas(sx,sy,center.x,center.y,ppi);
    ctx.save(); ctx.fillStyle="#ffd166"; ctx.strokeStyle="#ffc14b"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(cx,cy,7,0,Math.PI*2); ctx.fill();
    const v=headingVectorCanvas(sh,20); drawArrow(ctx,cx,cy,cx+v.dx,cy+v.dy,"#ffd166");
    ctx.restore();
  }

  function drawRectFootprint(ctx,x,y,h,L,W,options={}){
    const hx=L/2, hy=W/2;
    const cornersLocal=[{x:+hx,y:+hy},{x:+hx,y:-hy},{x:-hx,y:-hy},{x:-hx,y:+hy}];
    const cornersWorld=cornersLocal.map(v=>{ const w=rotateLocalToWorld(v.x,v.y,h); return {x:x+w.x,y:y+w.y}; });
    const c=cornersWorld.map(w=>worldToCanvas(w.x,w.y,center.x,center.y,ppi));
    ctx.save();
    ctx.beginPath(); ctx.moveTo(c[0].cx,c[0].cy); for(let i=1;i<c.length;i++) ctx.lineTo(c[i].cx,c[i].cy); ctx.closePath();
    ctx.globalAlpha=options.alpha??0.16; ctx.fillStyle=options.fill??"#6be675"; ctx.fill();
    ctx.globalAlpha=1; ctx.lineWidth=2; ctx.strokeStyle=options.stroke??"#6be675"; ctx.stroke();
    ctx.restore();
  }

  function drawPointMarkersAndFootprints(ctx){
    ctx.save();
    points.forEach((p,i)=>{
      const h=num(p.h??0);
      const {cx,cy}=worldToCanvas(p.x,p.y,center.x,center.y,ppi);
      ctx.fillStyle = i===points.length-1 ? "#ffffff" : "#cbd5e1";
      ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fill();
      const v=headingVectorCanvas(h,18); drawArrow(ctx,cx,cy,cx+v.dx,cy+v.dy,"#6be675");
    });
    if(points.length>0){
      const p=points[points.length-1]; const h=num(p.h??0);
      drawRectFootprint(ctx, p.x,p.y,h, robotL,robotW, {fill:"#7aa2ff",stroke:"#7aa2ff",alpha:0.12});
    }
    ctx.restore();
  }

  function drawPreview(ctx){
    const sx=num(startPose.x), sy=num(startPose.y), sh=num(startPose.h);
    const prev = points.length>0 ? points[points.length-1] : {x:sx,y:sy,h:sh};

    if(placeStart && preview){
      const pos=worldToCanvas(preview.x,preview.y,center.x,center.y,ppi);
      ctx.save(); ctx.fillStyle="#ffd166"; ctx.strokeStyle="#ffc14b"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(pos.cx,pos.cy,7,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.restore();
      return;
    }

    const fallbackHeading=()=> points.length>0 ? num(points[points.length-1]?.h??0) : num(startPose.h);
    const hFromMode=(vec)=>{
      const mag=Math.hypot(vec.dx??0,vec.dy??0);
      if(mode==="straight") return num(endHeadingInput);
      if(mag<=1e-6) return fallbackHeading();
      if(mode==="tangent") return headingFromDelta(vec.dx,vec.dy);
      if(mode==="orth-left") return perpendicularHeading(vec.dx,vec.dy,true);
      if(mode==="orth-right") return perpendicularHeading(vec.dx,vec.dy,false);
      return fallbackHeading();
    };

    if(shapeType==="bezier" && bezierTemp){
      ctx.save();
      const control = bezierTemp.control;
      const ctrlC=worldToCanvas(control.x,control.y,center.x,center.y,ppi);
      ctx.fillStyle="#bae6fd"; ctx.globalAlpha=.9; ctx.beginPath(); ctx.arc(ctrlC.cx,ctrlC.cy,4,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
      if(preview){
        const samples=sampleQuadraticBezier(prev, control, {x:preview.x,y:preview.y});
        if(samples?.length){
          ctx.setLineDash([8,6]); ctx.strokeStyle="#94a3b8"; ctx.lineWidth=2;
          const a=worldToCanvas(prev.x,prev.y,center.x,center.y,ppi);
          ctx.beginPath(); ctx.moveTo(a.cx,a.cy);
          for(const s of samples){ const c=worldToCanvas(s.x,s.y,center.x,center.y,ppi); ctx.lineTo(c.cx,c.cy); }
          ctx.stroke(); ctx.setLineDash([]);
          const last=samples[samples.length-1];
          const endC=worldToCanvas(preview.x,preview.y,center.x,center.y,ppi);
          const v=hFromMode(last?.tangent??{dx:preview.x-prev.x,dy:preview.y-prev.y});
          const arrow=headingVectorCanvas(v,18);
          drawArrow(ctx,endC.cx,endC.cy,endC.cx+arrow.dx,endC.cy+arrow.dy,"#94e2b8");
          drawRectFootprint(ctx, preview.x,preview.y, v, robotL,robotW, {fill:"#94e2b8",stroke:"#94e2b8",alpha:.10});
        }
      }
      ctx.restore(); return;
    }

    if(shapeType==="arc" && arcTemp){
      ctx.save();
      const mid=arcTemp.mid;
      const midC=worldToCanvas(mid.x,mid.y,center.x,center.y,ppi);
      ctx.fillStyle="#bae6fd"; ctx.globalAlpha=.9; ctx.beginPath(); ctx.arc(midC.cx,midC.cy,4,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
      if(preview){
        const samples=sampleCircularArcThrough(prev, mid, {x:preview.x,y:preview.y});
        if(samples?.length){
          ctx.setLineDash([8,6]); ctx.strokeStyle="#94a3b8"; ctx.lineWidth=2;
          const a=worldToCanvas(prev.x,prev.y,center.x,center.y,ppi);
          ctx.beginPath(); ctx.moveTo(a.cx,a.cy);
          for(const s of samples){ const c=worldToCanvas(s.x,s.y,center.x,center.y,ppi); ctx.lineTo(c.cx,c.cy); }
          ctx.stroke(); ctx.setLineDash([]);
          const last=samples[samples.length-1];
          const endC=worldToCanvas(preview.x,preview.y,center.x,center.y,ppi);
          const v=hFromMode(last?.tangent??{dx:preview.x-prev.x,dy:preview.y-prev.y});
          const arrow=headingVectorCanvas(v,18);
          drawArrow(ctx,endC.cx,endC.cy,endC.cx+arrow.dx,endC.cy+arrow.dy,"#94e2b8");
          drawRectFootprint(ctx, preview.x,preview.y, v, robotL,robotW, {fill:"#94e2b8",stroke:"#94e2b8",alpha:.10});
        }
      }
      ctx.restore(); return;
    }

    if(!preview) return;

    const a=worldToCanvas(prev.x,prev.y,center.x,center.y,ppi);
    const b=worldToCanvas(preview.x,preview.y,center.x,center.y,ppi);
    ctx.save();
    ctx.setLineDash([8,6]); ctx.strokeStyle="#94a3b8"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(a.cx,a.cy); ctx.lineTo(b.cx,b.cy); ctx.stroke(); ctx.setLineDash([]);
    const v=headingVectorCanvas(preview.h,18);
    drawArrow(ctx,b.cx,b.cy,b.cx+v.dx,b.cy+v.dy,"#94e2b8");
    drawRectFootprint(ctx, preview.x,preview.y, preview.h, robotL,robotW, {fill:"#94e2b8",stroke:"#94e2b8",alpha:.10});
    ctx.restore();
  }

  function drawPlaybackRobot(ctx){
    if(playState==="stopped" || points.length===0 || totalLen<=0) return;
    const g=getSegmentProgress(waypoints, playDist); if(!g) return;
    const {pos,i,t}=g;
    const h0=headingAtWaypoint(i), h1=headingAtWaypoint(i+1);
    const h=normDeg(h0 + shortestDeltaDeg(h0,h1)*t);
    drawRectFootprint(ctx,pos.x,pos.y,h,robotL,robotW,{fill:"#ffe08a",stroke:"#ffd166",alpha:.16});
    const c=worldToCanvas(pos.x,pos.y,center.x,center.y,ppi);
    const v=headingVectorCanvas(h,22); drawArrow(ctx,c.cx,c.cy,c.cx+v.dx,c.cy+v.dy,"#ffd166");
  }

  // Geometry helpers
  function getSegmentProgress(pts,dist){
    if(!pts||pts.length<2) return null;
    const total=polylineLength(pts); let d=clamp(dist,0,total);
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i], b=pts[i+1]; const seg=Math.hypot(b.x-a.x,b.y-a.y);
      if(seg<=1e-6) continue;
      if(d<=seg){ const t=seg===0?0:d/seg; return {i,t,a,b,segLen:seg,pos:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}}; }
      d-=seg;
    }
    const i=pts.length-2, a=pts[i], b=pts[i+1], segLen=Math.hypot(b.x-a.x,b.y-a.y);
    return {i,t:1,a,b,segLen,pos:{x:b.x,y:b.y}};
  }
  function headingAtWaypoint(k){ if(k===0) return num(startPose.h); return num(points[k-1]?.h??0); }
  function polylineLength(pts){ let s=0; for(let i=1;i<pts.length;i++) s+=Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y); return s; }

  // Headings for new points
  function computePreviewHeading(nx,ny){
    if(mode==="straight") return endHeadingInput;
    const sx=num(startPose.x), sy=num(startPose.y), sh=num(startPose.h);
    const prev = points.length>0 ? points[points.length-1] : {x:sx,y:sy,h:sh};
    const dx=nx-prev.x, dy=ny-prev.y;
    if(Math.abs(dx)<1e-6 && Math.abs(dy)<1e-6) return 0;
    if(mode==="tangent") return headingFromDelta(dx,dy);
    if(mode==="orth-left") return perpendicularHeading(dx,dy,true);
    if(mode==="orth-right") return perpendicularHeading(dx,dy,false);
    return 0;
  }

  // Interactions
  const snapStep = () => {
    const s=parseFloat(snapInches);
    return Number.isFinite(s) && s>0 ? s : 0;
  };

  function commitGridStepFromInput(){
    const parsed=parseFloat(gridStepEntry);
    if(!gridStepEntry || !Number.isFinite(parsed) || parsed<=0){
      setGridStep(DEFAULT_GRID_STEP); setGridStepEntry(String(DEFAULT_GRID_STEP));
    } else { setGridStep(parsed); setGridStepEntry(String(parsed)); }
  }

  function togglePlaceStart(){
    setPreview(null);
    setPlaceStart(prev=>{
      const next=!prev;
      if(!prev) { clearAll(); }
      return next;
    });
  }

  function appendPointsBatch(newPoints, meta={}){
    if(!newPoints||newPoints.length===0) return;
    setPoints(prev=>[...prev,...newPoints]);
    setUndoStack(prev=>[...prev,{ ...meta, type:meta?.type??"points", count:newPoints.length }]);
  }

  function placePointAt(x,y){
    const p={ x, y, h: computePreviewHeading(x,y), showHeading:true };
    appendPointsBatch([p], { type:"point" });
  }

  function onCanvasMove(e){
    const r=e.currentTarget.getBoundingClientRect();
    const cx=(e.clientX-r.left)*(canvasSize/r.width);
    const cy=(e.clientY-r.top)*(canvasSize/r.height);
    const raw=canvasToWorld(cx,cy,center.x,center.y,ppi);
    const s=snapToCorner(raw.x,raw.y,snapStep());
    if(placeStart) setPreview({ x:s.x, y:s.y, h:num(startPose.h) });
    else setPreview({ x:s.x, y:s.y, h: computePreviewHeading(s.x,s.y) });
  }
  function onCanvasLeave(){ setPreview(null); }

  function onCanvasClick(e){
    const r=e.currentTarget.getBoundingClientRect();
    const cx=(e.clientX-r.left)*(canvasSize/r.width);
    const cy=(e.clientY-r.top)*(canvasSize/r.height);
    const raw=canvasToWorld(cx,cy,center.x,center.y,ppi);
    const s=snapToCorner(raw.x,raw.y,snapStep());

    if(placeStart){ setStartPose(sp=>({...sp, x:s.x, y:s.y})); setPlaceStart(false); return; }

    if(shapeType==="line"){ placePointAt(s.x,s.y); return; }

    const anchor = points.length>0 ? points[points.length-1] : {x:num(startPose.x), y:num(startPose.y)};
    if(shapeType==="bezier"){
      if(!bezierTemp) setBezierTemp({ control:{x:s.x,y:s.y} });
      else{
        const samples=sampleQuadraticBezier(anchor, bezierTemp.control, {x:s.x,y:s.y});
        addSampledPointsWithHeading(samples);
        setBezierTemp(null);
      }
      return;
    }
    if(shapeType==="arc"){
      if(!arcTemp) setArcTemp({ mid:{x:s.x,y:s.y} });
      else{
        const samples=sampleCircularArcThrough(anchor, arcTemp.mid, {x:s.x,y:s.y});
        addSampledPointsWithHeading(samples);
        setArcTemp(null);
      }
      return;
    }
  }

  function addSampledPointsWithHeading(samples){
    if(!samples||samples.length===0) return;
    const appended=[];
    const sx=num(startPose.x), sy=num(startPose.y);
    const straight=num(endHeadingInput);
    let prev = points.length>0 ? points[points.length-1] : {x:sx,y:sy};
    for(let i=0;i<samples.length;i++){
      const s=samples[i]; let h;
      if(mode==="straight") h=straight;
      else{
        const vec=s.tangent ?? {dx:s.x-prev.x, dy:s.y-prev.y};
        if(mode==="tangent") h=headingFromDelta(vec.dx,vec.dy);
        else if(mode==="orth-left") h=perpendicularHeading(vec.dx,vec.dy,true);
        else if(mode==="orth-right") h=perpendicularHeading(vec.dx,vec.dy,false);
        else h=0;
      }
      appended.push({ x:s.x, y:s.y, h, showHeading: i===samples.length-1 });
      prev={x:s.x,y:s.y};
    }
    appendPointsBatch(appended,{type:shapeType});
  }

  function sampleQuadraticBezier(A,C,B){
    const approx = Math.hypot(C.x-A.x,C.y-A.y)+Math.hypot(B.x-C.x,B.y-C.y);
    const n=clamp(Math.ceil(approx/1.0),8,200);
    const out=[];
    for(let i=1;i<=n;i++){
      const t=i/n, omt=1-t;
      const x=omt*omt*A.x + 2*omt*t*C.x + t*t*B.x;
      const y=omt*omt*A.y + 2*omt*t*C.y + t*t*B.y;
      const dx=2*omt*(C.x-A.x) + 2*t*(B.x-C.x);
      const dy=2*omt*(C.y-A.y) + 2*t*(B.y-C.y);
      out.push({x,y,tangent:{dx,dy}});
    }
    return out;
  }

  function sampleCircularArcThrough(A,M,B){
    const x1=A.x,y1=A.y,x2=M.x,y2=M.y,x3=B.x,y3=B.y;
    const d=2*(x1*(y2-y3)+x2*(y3-y1)+x3*(y1-y2));
    if(Math.abs(d)<1e-6){
      const len=Math.hypot(B.x-A.x,B.y-A.y), n=clamp(Math.ceil(len/1.0),8,200), out=[];
      for(let i=1;i<=n;i++){
        const t=i/n, x=A.x+(B.x-A.x)*t, y=A.y+(B.y-A.y)*t;
        out.push({x,y,tangent:{dx:(B.x-A.x),dy:(B.y-A.y)}});
      }
      return out;
    }
    const ux=((x1*x1+y1*y1)*(y2-y3)+(x2*x2+y2*y2)*(y3-y1)+(x3*x3+y3*y3)*(y1-y2))/d;
    const uy=((x1*x1+y1*y1)*(x3-x2)+(x2*x2+y2*y2)*(x1-x3)+(x3*x3+y3*y3)*(x2-x1))/d;
    const thA=Math.atan2(y1-uy,x1-ux), thM=Math.atan2(y2-uy,x2-ux), thB=Math.atan2(y3-uy,x3-ux);
    const norm=a=> (a%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
    const spanCCW=(norm(thB)-norm(thA)+2*Math.PI)%(2*Math.PI);
    const mSpanCCW=(norm(thM)-norm(thA)+2*Math.PI)%(2*Math.PI);
    const passesCCW = mSpanCCW <= spanCCW + 1e-9;
    let delta = passesCCW ? spanCCW : -((norm(thA)-norm(thB)+2*Math.PI)%(2*Math.PI));
    const r=Math.hypot(x1-ux,y1-uy), arcLen=Math.abs(r*delta), n=clamp(Math.ceil(arcLen/1.0),8,240);
    const out=[];
    for(let i=1;i<=n;i++){
      const t=i/n, th=thA+delta*t, x=ux+r*Math.cos(th), y=uy+r*Math.sin(th);
      const dth = delta>0?1:-1, dx=-r*Math.sin(th)*dth, dy=r*Math.cos(th)*dth;
      out.push({x,y,tangent:{dx,dy}});
    }
    return out;
  }

  function undoLast(){
    if(bezierTemp){ setBezierTemp(null); setPreview(null); return; }
    if(arcTemp){ setArcTemp(null); setPreview(null); return; }
    if(undoStack.length===0) return;
    const last=undoStack[undoStack.length-1], removeCount=Math.max(0,last?.count??0);
    if(removeCount>0) setPoints(prev=>prev.slice(0, Math.max(0, prev.length-removeCount)));
    setUndoStack(prev=>prev.slice(0,-1));
  }

  function clearAll(){
    setPoints([]); setTags([]); setUndoStack([]); setBezierTemp(null); setArcTemp(null); setPreview(null);
  }

  // Playback
  function togglePlayPause(){
    if(points.length===0 || totalLen<=0) return;
    if(playState==="playing") setPlayState("paused");
    else { setPlayState("playing"); lastTsRef.current=0; }
  }
  function stopPreview(){
    setPlayState("stopped"); setPlayDist(0);
    if(rafRef.current) cancelAnimationFrame(rafRef.current);
  }

  // Background
  function handleFile(e){
    const f=e.target.files?.[0]; if(!f) return;
    const url=URL.createObjectURL(f);
    const img=new Image(); img.onload=()=>setBgImg(img); img.src=url;
  }
  function resetToDefaultImage(){
    const img=new Image(); img.onload=()=>setBgImg(img); img.src=decodeField;
  }

  // Upload
  async function uploadPayload(payload){
    const ROBOT_IP="192.168.43.1";
    const res = await fetch(`http://${ROBOT_IP}:8099/points`, {
      method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  function doUpload(){
    if(uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
    setUploadStatus("sending");
    const payload = {
      start: [num(startPose.x), num(startPose.y), num(startPose.h)],
      points: points.map(p=>[Number(p.x), Number(p.y), Number(p.h??0)]),
      velocity: Number(velocity)||0,
      tolerance: Number(tolerance)||0,
      tags: tags.map(t=>({ index: Number(t.index)||0, name: String(t.name||""), value: Number(t.value)||0 })),
    };
    uploadPayload(payload)
      .then(()=>{
        setUploadStatus("ok");
        uploadTimerRef.current=setTimeout(()=>setUploadStatus("idle"), 1800);
      })
      .catch(()=>{
        setUploadStatus("fail");
        uploadTimerRef.current=setTimeout(()=>setUploadStatus("idle"), 2200);
      });
  }

  // Export code (path + tags + config, but NO snap)
  const code = useMemo(()=>{
    const sx=toFixed(num(startPose.x)), sy=toFixed(num(startPose.y)), sh=toFixed(num(startPose.h));
    const path=points.map(p=>({ x:toFixed(p.x), y:toFixed(p.y), h:toFixed(num(p.h??0)) }));
    const poses=[
      `new Pose2D(DistanceUnit.INCH, ${sx}, ${sy}, AngleUnit.DEGREES, ${sh})`,
      ...path.map(p=>`new Pose2D(DistanceUnit.INCH, ${p.x}, ${p.y}, AngleUnit.DEGREES, ${p.h})`)
    ].join(",\n    ");
    const tagLines = tags.map(t=>`new Tag("${(t.name??"").replace(/"/g,'\\"')}", ${Number(t.value)||0}, ${Number(t.index)||0})`).join(",\n    ");
    return `// ---- PATH ----
public static Pose2D[] path = new Pose2D[] {
    ${poses}
};

// ---- TAGS ----
public static class Tag {
    public final String name; public final int value; public final int index; // 0=start, 1..N points (auto: most recent point)
    public Tag(String name, int value, int index){ this.name=name; this.value=value; this.index=index; }
}
public static Tag[] tags = new Tag[] {
    ${tagLines}
};

// ---- CONFIG ----
public static double VELOCITY_IN_S = ${toFixed(velocity,2)};
public static double TOLERANCE_IN = ${toFixed(Number(tolerance)||0,2)};`;
  },[points,startPose,tags,velocity,tolerance]);

  // Clipboard
  function triggerCopiedFeedback(){
    setCopied(true); setTimeout(()=>setCopied(false), 1600);
  }
  function copyCode(){
    (navigator.clipboard?.writeText?.(code) ?? Promise.reject())
      .then(triggerCopiedFeedback).catch(triggerCopiedFeedback);
  }

  // Tags: attach to most recent point
  function addTag(){
    if(points.length===0) return; // disabled in UI anyway
    const idx = points.length;          // 0=start, 1..N points => latest point is points.length
    const name=(tagName??"").trim();
    const value=Math.floor(Number(tagValue)||0);
    if(!name) return;
    setTags(prev=>[...prev, { index: idx, name, value }]);
    setTagName(""); setTagValue(0);
  }
  function removeTag(i){ setTags(prev=>prev.filter((_,k)=>k!==i)); }

  // UI
  return (
    <div className="app">
      <style>{styles}</style>

      {/* LEFT: Build Path */}
      <aside className="panel">
        <div className="scroll">
          {/* Field image */}
          <section className="section">
            <h3>Field Background</h3>
            <div className="row">
              <label className="small">Upload (.png .jpg .svg)</label>
              <input className="input" type="file" accept="image/*" onChange={handleFile}/>
            </div>
          </section>
          <section className="section">
            <div className="inline">
              <button className="btn ghost" onClick={resetToDefaultImage}>Default field</button>
              <select className="input" style={{flex:1}} value={canvasSize} onChange={(e)=>setCanvasSize(parseInt(e.target.value))}>
                <option value={600}>Canvas 600</option>
                <option value={720}>Canvas 720</option>
                <option value={900}>Canvas 900</option>
              </select>
            </div>
          </section>

          <hr className="sep" />

          {/* Segment & Heading */}
          <section className="section">
            <h3>Segment Type</h3>
            <div className="grid three">
              <button className={`btn ${shapeType==='line' ? 'primary':''}`} onClick={()=>{ setShapeType('line'); setBezierTemp(null); setArcTemp(null); }}>Line</button>
              <button className={`btn ${shapeType==='bezier' ? 'primary':''}`} onClick={()=>{ setShapeType('bezier'); setArcTemp(null); }}>Bezier</button>
              <button className={`btn ${shapeType==='arc' ? 'primary':''}`} onClick={()=>{ setShapeType('arc'); setBezierTemp(null); }}>Arc</button>
            </div>
          </section>

          <section className="section">
            <h3>Heading Mode</h3>
            <div className="grid two">
              <button className={`btn ${mode==='straight'?'primary':''}`} onClick={()=>setMode('straight')}>Straight + End Heading</button>
              <button className={`btn ${mode==='tangent'?'primary':''}`} onClick={()=>setMode('tangent')}>Tangent (forward)</button>
            </div>
            <div className="grid two">
              <button className={`btn ${mode==='orth-left'?'primary':''}`} onClick={()=>setMode('orth-left')}>Orthogonal (left)</button>
              <button className={`btn ${mode==='orth-right'?'primary':''}`} onClick={()=>setMode('orth-right')}>Orthogonal (right)</button>
            </div>
            {mode === 'straight' && (
              <div className="row">
                <label>Desired end heading (°)</label>
                <input className="number" type="text" value={String(endHeadingInput)}
                  onChange={e=>{ const v=e.target.value; if(v===""||v==="-" ) setEndHeadingInput(v); else { const n=parseFloat(v); if(!isNaN(n)) setEndHeadingInput(normDeg(n)); } }}/>
              </div>
            )}
          </section>

          {/* Motion + Placement */}
          <section className="section">
            <h3>Motion</h3>
            <div className="grid two">
              <div>
                <label>Velocity (in/s)</label>
                <input className="number" type="number" min={1} max={120} step={1} value={velocity} onChange={(e)=>setVelocity(parseFloat(e.target.value))}/>
              </div>
              <div>
                <label>Preview speed (in/s)</label>
                <input className="number" type="number" min={1} max={120} step={1} value={playSpeed} onChange={(e)=>setPlaySpeed(parseFloat(e.target.value))}/>
              </div>
            </div>
            <div className="grid two">
              <div>
                <label>Tolerance (in)</label>
                <input className="number" type="number" min={0} step={0.1} value={tolerance} onChange={(e)=>setTolerance(e.target.value)}/>
              </div>
              <div>
                <label>Snap (in) <span className="small">(placement only)</span></label>
                <input className="number" type="number" min={0} step={0.1} value={snapInches} onChange={(e)=>setSnapInches(e.target.value)}/>
              </div>
            </div>
          </section>

          {/* Start pose */}
          <section className="section">
            <h3>Start Pose</h3>
            <div className="grid three">
              <div><label>X (in)</label><input className="number" type="text" value={String(startPose.x)}
                onChange={e=>{ const v=e.target.value; if(v===""||v==="-" ) setStartPose({...startPose,x:v}); else { const n=parseFloat(v); if(!isNaN(n)) setStartPose({...startPose,x:n}); } }}/></div>
              <div><label>Y (in)</label><input className="number" type="text" value={String(startPose.y)}
                onChange={e=>{ const v=e.target.value; if(v===""||v==="-" ) setStartPose({...startPose,y:v}); else { const n=parseFloat(v); if(!isNaN(n)) setStartPose({...startPose,y:n}); } }}/></div>
              <div><label>Heading (°)</label><input className="number" type="text" value={String(startPose.h)}
                onChange={e=>{ const v=e.target.value; if(v===""||v==="-" ) setStartPose({...startPose,h:v}); else { const n=parseFloat(v); if(!isNaN(n)) setStartPose({...startPose,h:normDeg(n)}); } }}/></div>
            </div>
            <button className={`btn ${placeStart ? 'primary' : 'ok'}`} onClick={togglePlaceStart}>
              {placeStart ? 'Select on field…' : 'Click to place start'}
            </button>
          </section>

          {/* Grid & Robot */}
          <section className="section">
            <div className="grid two">
              <div>
                <h3>Grid Overlay</h3>
                <div className="grid two">
                  <select className="input" value={showGrid ? "on":"off"} onChange={(e)=>setShowGrid(e.target.value==="on")}>
                    <option value="off">Off</option>
                    <option value="on">On</option>
                  </select>
                  <input className="number" type="number" min={0.25} step={0.25} value={gridStepEntry}
                    onChange={(e)=>setGridStepEntry(e.target.value)}
                    onBlur={commitGridStepFromInput}
                    onKeyDown={(e)=>{ if(e.key==='Enter'){ commitGridStepFromInput(); e.currentTarget.blur(); } }}
                    disabled={!showGrid} style={showGrid?undefined:{opacity:.55}}/>
                </div>
              </div>
              <div>
                <h3>Robot Footprint</h3>
                <div className="grid two">
                  <input className="number" type="number" value={robotL} min={1} max={36} step={0.5} onChange={(e)=>setRobotL(parseFloat(e.target.value))}/>
                  <input className="number" type="number" value={robotW} min={1} max={36} step={0.5} onChange={(e)=>setRobotW(parseFloat(e.target.value))}/>
                </div>
                <div className="small">L (+x), W (+y)</div>
              </div>
            </div>
          </section>

          {/* Tags (no list, no "add a point first" overlay) */}
          <section className="section">
            <h3>Tags</h3>
            <div className="grid two">
              <input className="input" type="text" placeholder="Name (e.g., intakeOn)"
                     value={tagName} onChange={(e)=>setTagName(e.target.value)} />
              <input className="number" type="number" step={1} placeholder="Value"
                     value={tagValue} onChange={(e)=>setTagValue(e.target.value)} />
            </div>
            <div className="inline">
              <button className="btn ok" onClick={addTag} disabled={points.length===0 || !tagName.trim()}>
                Add Tag
              </button>
              <span className="small">Tags attach to the most recent point you placed.</span>
            </div>
          </section>
        </div>
      </aside>

      {/* CENTER: Canvas */}
      <main className="canvasWrap">
        <div className="canvasStack" style={{ width:`${canvasSize}px`, height:`${canvasSize}px` }}>
          <canvas
            ref={canvasRef}
            width={canvasSize}
            height={canvasSize}
            onMouseMove={onCanvasMove}
            onMouseLeave={onCanvasLeave}
            onClick={onCanvasClick}
            style={{ display:'block' }}
          />
          {/* Removed pointer events on overlay for snappy feel */}
          <canvas ref={overlayRef} width={canvasSize} height={canvasSize}
            style={{ position:'absolute', inset:0, pointerEvents:'none' }} />
        </div>
      </main>

      {/* RIGHT: Run & Export (now richer) */}
      <aside className="panel">
        {/* Sticky action bar */}
        <div className="sticky">
          <div className="inline">
            <button
              className={`btn ${
                uploadStatus==='ok' ? 'ok' :
                uploadStatus==='fail' ? 'danger' :
                uploadStatus==='sending' ? 'warn' : 'primary'
              }`}
              onClick={doUpload}
              title="Send start + points + tags + settings to robot"
            >
              {uploadStatus==='sending' ? 'Uploading…' :
               uploadStatus==='ok' ? 'Uploaded' :
               uploadStatus==='fail' ? 'Failed Upload' : 'Upload'}
            </button>
            <button className="btn ghost" onClick={copyCode}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="inline">
            <button className={`btn ${playState==='playing'?'primary':''}`} onClick={togglePlayPause}>
              {playState==='playing' ? '⏸ Pause' : '▶ Play'}
            </button>
            <button className="btn danger" onClick={stopPreview}>⏹ Stop</button>
          </div>
        </div>

        <div className="scroll">
          {/* Path stats to fill space + quick read */}
          <section className="section">
            <h3>Path Stats</h3>
            <div className="stats">
              <div className="stat"><div className="k">Points</div><div className="v">{points.length}</div></div>
              <div className="stat"><div className="k">Length (in)</div><div className="v">{toFixed(totalLen,1)}</div></div>
              <div className="stat"><div className="k">Est. Time (s)</div><div className="v">{toFixed((totalLen || 0)/Math.max(velocity||1,1),1)}</div></div>
            </div>
            <div className="small">Progress: {totalLen>0?Math.round((playDist/totalLen)*100):0}% • {toFixed(playDist,1)} / {toFixed(totalLen,1)} in</div>
          </section>

          <hr className="sep" />

          {/* Export code */}
          <section className="section">
            <h3>Copy / Export</h3>
            <textarea className="codebox" readOnly value={code} />
            <div className="inline">
              <button className="btn ghost" onClick={undoLast}>Undo</button>
              <button className="btn danger" onClick={clearAll}>Clear Path</button>
            </div>
          </section>

          <hr className="sep" />

          {/* Legend & Tips (fills the right visually) */}
          <section className="section">
            <h3>Legend</h3>
            <div className="legend">
              <span className="chip"><span className="dot" style={{background:"#ffd166"}}/> Start</span>
              <span className="chip"><span className="dot" style={{background:"#cbd5e1"}}/> Waypoint</span>
              <span className="chip"><span className="dot" style={{background:"#7aa2ff"}}/> Robot footprint</span>
              <span className="chip"><span className="dot" style={{background:"#5cd2ff"}}/> Path line</span>
            </div>
          </section>

          <section className="section">
            <h3>Tips</h3>
            <ul className="small" style={{margin:0, paddingLeft:18}}>
              <li>Place start, pick a segment type, then click to add points.</li>
              <li>Use Snap for cleaner placement; Tolerance helps downstream control.</li>
              <li>Tags attach to the latest point—add them right after placing it.</li>
              <li>Preview speed is independent of your motion Velocity.</li>
            </ul>
          </section>
        </div>
      </aside>

      <footer>FTC path planning • +X forward, +Y left, +heading left • 1 tile = 24" • 12×12 tiles</footer>
    </div>
  );
}
