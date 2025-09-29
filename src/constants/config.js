export const FIELD_SIZE_IN = 144;
export const FIELD_EDGE_IN = FIELD_SIZE_IN / 2;

export const DEFAULT_CANVAS_SIZE = 720;

export const GRID_DEFAULT_STEP = 24;
export const GRID_MIN_STEP = 0.25;

export const DEFAULT_SNAP_IN = 3;
export const DEFAULT_TOLERANCE_IN = 5;
export const DEFAULT_VELOCITY_IN_PER_S = 30;
export const DEFAULT_PLAYBACK_SPEED_IN_PER_S = 30;

export const DEFAULT_ROBOT_DIMENSIONS = {
    length: 18,
    width: 18,
};

export const DEFAULT_LEFT_PANEL_WIDTH = 420;
export const DEFAULT_RIGHT_PANEL_WIDTH = 420;

export const POSE_POLL_INTERVAL_MS = 10;
export const HUB_IP = "192.168.43.1";
export const HUB_POINTS_URL = `http://${HUB_IP}:8099/points`;
export const HUB_POSE_URL = `http://${HUB_IP}:8099/pose`;
export const HUB_RUN_URL = `http://${HUB_IP}:8099/run`;

export const UPLOAD_RESET_OK_MS = 1800;
export const UPLOAD_RESET_FAIL_MS = 2200;

export const PATH_SAMPLE_STEP_IN = 1;
export const BEZIER_MIN_SAMPLES = 8;
export const BEZIER_MAX_SAMPLES = 200;
export const ARC_MAX_SAMPLES = 240;

export const LIVE_POSE_SYNC_PREFIX = "init";
