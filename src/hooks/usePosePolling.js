import {useEffect, useRef, useState} from "react";
import {HUB_POSE_URL, POSE_POLL_INTERVAL_MS} from "../constants/config";

const parseRobotState = (payload) => {
    if (typeof payload?.state === "string") return payload.state;
    if (typeof payload?.mode === "string") return payload.mode;
    return null;
};

export const usePosePolling = ({enabled = true, interval = POSE_POLL_INTERVAL_MS} = {}) => {
    const [pose, setPose] = useState(null);
    const [robotState, setRobotState] = useState(null);
    const timerRef = useRef(null);

    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;

        const poll = async () => {
            try {
                const res = await fetch(HUB_POSE_URL, {cache: "no-store"});
                if (res.ok) {
                    const json = await res.json();
                    if (!cancelled && json?.ok) {
                        setPose({x: json.x, y: json.y, h: json.h, t: json.t});
                        const maybeState = parseRobotState(json);
                        if (maybeState !== null) setRobotState(maybeState);
                    }
                }
            } catch {
                // swallow network errors; planner keeps using last known pose
            }
            if (!cancelled) timerRef.current = window.setTimeout(poll, interval);
        };

        poll();
        return () => {
            cancelled = true;
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
    }, [enabled, interval]);

    return {livePose: pose, robotState};
};
