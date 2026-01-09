import {useEffect, useRef, useState} from "react";
import {HUB_POSE_URL, POSE_POLL_INTERVAL_MS} from "../constants/config";

const parseRobotState = (payload) => {
    if (typeof payload?.state === "string") return payload.state;
    if (typeof payload?.mode === "string") return payload.mode;
    return null;
};

const clampInterval = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 16;
    return Math.max(16, parsed);
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hasPoseData = (json) => {
    if (!json || typeof json !== "object") return false;
    const {x, y} = json;
    return Number.isFinite(Number(x)) && Number.isFinite(Number(y));
};

export const usePosePolling = ({enabled = true, interval = POSE_POLL_INTERVAL_MS, hubUrl = HUB_POSE_URL} = {}) => {
    const [pose, setPose] = useState(null);
    const [robotState, setRobotState] = useState(null);
    const controllerRef = useRef(null);

    useEffect(() => {
        if (!enabled) {
            if (controllerRef.current) controllerRef.current.abort();
            return undefined;
        }

        let cancelled = false;
        const minInterval = clampInterval(interval);
        const fetchTimeoutMs = Math.max(120, Math.round(minInterval * 1.5));

        const pollContinuously = async () => {
            while (!cancelled) {
                const start = performance.now();
                const controller = new AbortController();
                controllerRef.current = controller;
                const abortTimeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

                try {
                    const res = await fetch(hubUrl, {cache: "no-store", signal: controller.signal});
                    if (res.ok) {
                        const json = await res.json();
                        if (!cancelled && (json?.ok || hasPoseData(json))) {
                            const nextPose = {x: json.x, y: json.y, h: json.h, t: json.t};
                            setPose((prev) => {
                                if (
                                    prev &&
                                    nextPose &&
                                    prev.x === nextPose.x &&
                                    prev.y === nextPose.y &&
                                    prev.h === nextPose.h &&
                                    prev.t === nextPose.t
                                ) {
                                    return prev;
                                }
                                return nextPose;
                            });
                            const maybeState = parseRobotState(json);
                            if (maybeState !== null) setRobotState(maybeState);
                        }
                    }
                } catch {
                    // swallow network errors; planner keeps using last known pose
                } finally {
                    clearTimeout(abortTimeout);
                    if (controllerRef.current === controller) controllerRef.current = null;
                    const elapsed = performance.now() - start;
                    const remaining = minInterval - elapsed;
                    if (remaining > 0) {
                        await delay(remaining);
                    }
                }
            }
        };

        pollContinuously();

        return () => {
            cancelled = true;
            if (controllerRef.current) controllerRef.current.abort();
        };
    }, [enabled, interval, hubUrl]);

    return {livePose: pose, robotState};
};
