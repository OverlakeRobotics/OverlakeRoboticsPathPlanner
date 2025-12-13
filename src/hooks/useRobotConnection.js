import { useState, useEffect, useRef, useCallback } from 'react';
import { usePosePolling } from './usePosePolling';
import { RobotWebSocket } from '../utils/websocket';
import { HUB_WS_PORT } from '../constants/config';

export function useRobotConnection(hubIp) {
    const [isConnected, setIsConnected] = useState(false);
    const [robotStatus, setRobotStatus] = useState(null);
    const [robotConfig, setRobotConfig] = useState(null);
    const [livePose, setLivePose] = useState(null);
    const [lastMessageTime, setLastMessageTime] = useState(null);

    const socketRef = useRef(null);
    // merge HTTP-polled pose (PathServer) as a fallback when websocket doesn't provide pose
    const { livePose: polledPose } = usePosePolling({ enabled: true, hubUrl: `http://${hubIp}:8099/pose` });

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

                // WebSocket does not provide live pose in this setup; rely on HTTP polling instead.
                return;
            }

            // other message types handled below

            if (message.type === 'RECEIVE_CONFIG') {
                // Some robot configs are sent with nested __type / __value wrappers.
                // Unwrap them to plain JS objects before storing.
                try {
                    const cfgRoot = message.configRoot || message.config || null;
                    if (cfgRoot) {
                        const unwrapped = unwrap(cfgRoot);
                        setRobotConfig(unwrapped);
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
            return polledT > curT ? polledPose : current;
        });
    }, [polledPose]);

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

    const sendInit = useCallback((opModeName) => {
        socketRef.current?.sendInit(opModeName);
    }, []);

    const sendStart = useCallback(() => {
        socketRef.current?.sendStart();
    }, []);

    const sendStop = useCallback(() => {
        socketRef.current?.sendStop();
    }, []);

    return {
        isConnected,
        robotStatus,
        robotConfig,
        livePose,
        sendInit,
        sendStart,
        sendStop
    };
}
