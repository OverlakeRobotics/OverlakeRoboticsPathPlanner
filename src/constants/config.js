// === Field Geometry ===
export const FIELD_SIZE_IN = 144;
export const FIELD_EDGE_IN = FIELD_SIZE_IN / 2;

// === Canvas & Layout ===
export const DEFAULT_CANVAS_SIZE = 720;
export const DEFAULT_LEFT_PANEL_WIDTH = 420;
export const DEFAULT_RIGHT_PANEL_WIDTH = 420;
export const MIN_LEFT_PANEL_WIDTH = 240;
export const MIN_RIGHT_PANEL_WIDTH = 240;

// === Grid & Snapping ===
export const GRID_DEFAULT_STEP = 24;
export const GRID_MIN_STEP = 0.25;
export const DEFAULT_SNAP_IN = 3;

// === Planner Defaults ===
export const DEFAULT_TOLERANCE_IN = 5;
export const DEFAULT_VELOCITY_IN_PER_S = 30;
export const DEFAULT_PLAYBACK_SPEED_IN_PER_S = 30;
export const DEFAULT_MAX_ACCEL_IN_PER_S2 = 40;
export const SPEED_PROFILE_SAMPLE_STEP_IN = 1;
export const EPS = 1e-6;

export const DEFAULT_ROBOT_DIMENSIONS = {
    length: 18,
    width: 18,
};

// === Remote Hub Communication ===
export const POSE_POLL_INTERVAL_MS = 500; // increase default poll interval to reduce spamming on connection failures
export const HUB_IP = "192.168.43.1";
export const HUB_POINTS_URL = `http://${HUB_IP}:8099/points`;
export const HUB_POSE_URL = `http://${HUB_IP}:8099/pose`;
export const HUB_RUN_URL = `http://${HUB_IP}:8099/run`;
export const LIVE_POSE_SYNC_PREFIX = "init";

export const UPLOAD_RESET_OK_MS = 1800;
export const UPLOAD_RESET_FAIL_MS = 2200;

// === Path Sampling ===
export const PATH_SAMPLE_STEP_IN = 1;
export const BEZIER_MIN_SAMPLES = 8;
export const BEZIER_MAX_SAMPLES = 200;
export const ARC_MAX_SAMPLES = 240;
export const MIN_DRAW_SAMPLE_SPACING_IN = 0.25;
export const MIN_DRAW_SEGMENT_LEN_IN = 0.5;
export const DRAW_SIMPLIFY_TOLERANCE_IN = 0.2;

export const TWO_PI = Math.PI * 2;

// === Palette ===
export const PATH_COLOR = "#5cd2ff";
export const START_COLOR = "#ffd166";
export const WAYPOINT_COLOR = "#cbd5e1";
export const LAST_POINT_COLOR = "#ffffff";
export const FOOTPRINT_FILL = "#6be675";
export const LIVE_POSE_FILL = "#ff6ad5";
export const PREVIEW_FILL = "#94e2b8";
export const DRAW_RAW_COLOR = "#94a3b8";
export const DRAW_FIT_COLOR = "#38bdf8";
export const DRAW_LABEL_FILL = "rgba(15,23,42,0.82)";
export const DRAW_LABEL_STROKE = "rgba(255,255,255,0.8)";

export const HUB_WS_PORT = 8000;


