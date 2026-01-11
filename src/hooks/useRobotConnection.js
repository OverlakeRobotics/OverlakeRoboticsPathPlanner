import { useState, useEffect, useRef, useCallback } from 'react';
import { usePosePolling } from './usePosePolling';
import { RobotWebSocket } from '../utils/websocket';
import { HUB_PORT, HUB_WS_PORT } from '../constants/config';

export function useRobotConnection(hubIp) {
    const [isConnected, setIsConnected] = useState(false);
    const [robotStatus, setRobotStatus] = useState(null);
    const [robotConfig, setRobotConfig] = useState(null);
    const [livePose, setLivePose] = useState(null);
    const [lastMessageTime, setLastMessageTime] = useState(null);

    const socketRef = useRef(null);
    const robotStatusRef = useRef(null);
    const shouldPollPose = Boolean(hubIp);
    const { livePose: polledPose } = usePosePolling({
        enabled: shouldPollPose,
        hubUrl: `http://${hubIp}:8099/pose`
    });

    useEffect(() => {
        const socket = new RobotWebSocket(hubIp, HUB_WS_PORT);
        socketRef.current = socket;

        socket.onOpen = () => {
            setIsConnected(true);
        };

        socket.onClose = () => {
            setIsConnected(false);
        };

        // Recursively unwrap objects sent with the robot's custom type wrapper
        const unwrap = (val) => {
            if (val === null || val === undefined) return val;
            if (Array.isArray(val)) return val.map(unwrap);
            if (typeof val === 'object') {
                // If this object is a typed wrapper with __type and __value, unwrap its value
                if ('__type' in val && '__value' in val) {
                    return unwrap(val.__value);
                }
                const out = {};
                for (const k of Object.keys(val)) {
                    out[k] = unwrap(val[k]);
                }
                return out;
            }
            return val;
        };

        socket.onMessage = (message) => {
            setLastMessageTime(Date.now());
    
            if (message.type === 'RECEIVE_ROBOT_STATUS') {
                const status = message.status || message;
    
                // Normalize robot status fields so UI components can rely on consistent keys
                const normalized = {
                    // prefer explicit mapping; fall back to existing keys
                    opMode: status.activeOpMode || status.opMode || status.activeOpModeName || null,
                    status: status.activeOpModeStatus || status.status || status.state || null,
                    battery: status.batteryVoltage || status.battery || status.batteryV || null,
                    enabled: status.enabled !== undefined ? status.enabled : (status.isEnabled || null),
                    available: status.available !== undefined ? status.available : null,
                    // keep original payload for advanced uses
                    raw: status,
                };
    
                setRobotStatus(normalized);
                robotStatusRef.current = normalized;
    
                // WebSocket does not provide live pose in this setup; rely on HTTP polling instead.
                return;
            }
    
            // Support receiving a list of available op modes from the hub
            if (message.type === 'RECEIVE_OP_MODE_LIST') {
                try {
                    const list = Array.isArray(message.opModeList) ? message.opModeList : (message.list || []);
                    setRobotConfig((prev) => ({ ...(prev || {}), opModeList: list }));
                    return;
                } catch (e) {
                    console.error('Error processing op mode list', e);
                }
                return;
            }
    
            if (message.type === 'RECEIVE_CONFIG') {
                // Some robot configs are sent with nested __type / __value wrappers.
                // Unwrap them to plain JS objects before storing.
                try {
                    const cfgRoot = message.configRoot || message.config || null;
                    if (cfgRoot) {
                        const unwrapped = unwrap(cfgRoot);
                        setRobotConfig((prev) => {
                            const base = prev && typeof prev === 'object' ? prev : {};
                            const next = typeof unwrapped === 'object' && unwrapped !== null ? unwrapped : {};
                            return { ...base, ...next };
                        });
                    }
                } catch (e) {
                    console.error('Error unwrapping config message', e);
                }
                return;
            }
        };

        socket.connect();


        return () => {
            socket.disconnect();
        };
    }, [hubIp]);

    // Merge polled pose into livePose when websocket hasn't provided a newer one.
    useEffect(() => {
        if (!polledPose) return;
        setLivePose((current) => {
            if (!current) return polledPose;
            const curT = Number(current.t || 0);
            const polledT = Number(polledPose.t || 0);
            if (polledT > curT) return polledPose;
            const positionChanged =
                Math.abs(Number(polledPose.x) - Number(current.x)) > 1e-3 ||
                Math.abs(Number(polledPose.y) - Number(current.y)) > 1e-3 ||
                Math.abs(Number(polledPose.h ?? 0) - Number(current.h ?? 0)) > 1e-3;
            return positionChanged ? polledPose : current;
        });
    }, [polledPose]);

    // Keep ref in sync when robotStatus changes outside socket handler
    useEffect(() => {
        robotStatusRef.current = robotStatus;
    }, [robotStatus]);

    useEffect(() => {
        let interval;
        if (isConnected) {
            // Poll for status immediately and then every 1 second
            socketRef.current?.requestStatus();
            interval = setInterval(() => {
                socketRef.current?.requestStatus();
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isConnected]);

    const sendInit = useCallback(async (opModeName) => {
        console.log('[useRobotConnection] sendInit called with:', opModeName);
        try {
            const res = await socketRef.current?.sendInit(opModeName);
            // After sending INIT, request an immediate status so waiters see the change quickly
            try {
                socketRef.current?.requestStatus();
            } catch (e) {
                // ignore
            }
            return res;
        } catch (e) {
            console.error('[useRobotConnection] sendInit error', e);
            throw e;
        }
    }, []);

    const sendStart = useCallback(() => {
        socketRef.current?.sendStart();
    }, []);

    const sendStop = useCallback(() => {
        socketRef.current?.sendStop();
    }, []);

    const getRobotStatus = useCallback(() => robotStatusRef.current, []);

    const isInitializedFor = useCallback((opModeName) => {
        const s = robotStatusRef.current;
        if (!s || !opModeName) return false;
        const cur = String(s.opMode || s.raw?.activeOpMode || '').toLowerCase();
        return cur.includes(String(opModeName).toLowerCase());
    }, []);

    const waitForOpMode = useCallback((opModeName, timeoutMs = 6000) => {
        if (!opModeName) return Promise.reject(new Error('opModeName is required'));
        const target = String(opModeName).toLowerCase();
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + timeoutMs;
            const poll = () => {
                const status = robotStatusRef.current;
                const current = String(status?.opMode || status?.raw?.activeOpMode || '').toLowerCase();
                if (current.includes(target)) {
                    resolve(true);
                    return;
                }
                if (Date.now() > deadline) {
                    reject(new Error('timeout'));
                    return;
                }
                setTimeout(poll, 200);
            };
            poll();
        });
    }, []);

    const checkPathServer = useCallback(async ({ timeoutMs = 1200 } = {}) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(`http://${hubIp}:${HUB_PORT}/pose`, {
                cache: 'no-store',
                signal: controller.signal,
            });
            return response.ok;
        } catch {
            return false;
        } finally {
            clearTimeout(timer);
        }
    }, [hubIp]);

    return {
        isConnected,
        robotStatus,
        robotConfig,
        livePose,
        sendInit,
        sendStart,
        sendStop,
        getRobotStatus,
        isInitializedFor,
        waitForOpMode,
        checkPathServer
    };
}
