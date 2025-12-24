import {useCallback, useEffect, useRef, useState} from "react";

export const usePlayback = ({totalLength = 0, speed = 0}) => {
    const [state, setState] = useState("stopped");
    const [distance, setDistance] = useState(0);
    const rafRef = useRef(null);
    const lastFrameRef = useRef(0);

    useEffect(() => {
        if (state !== "playing") return undefined;

        const loop = (timestamp) => {
            if (state !== "playing") return;
            if (!lastFrameRef.current) lastFrameRef.current = timestamp;
            const delta = (timestamp - lastFrameRef.current) / 1000;
            lastFrameRef.current = timestamp;
            setDistance((prev) => {
                const next = Math.min(prev + Math.max(speed, 0) * delta, totalLength || 0);
                if (next >= (totalLength || 0)) setState("paused");
                return next;
            });
            rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [state, speed, totalLength]);

    useEffect(() => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }, []);

    useEffect(() => {
        setDistance((prev) => Math.min(prev, totalLength || 0));
    }, [totalLength]);

    const play = useCallback(() => {
        if ((totalLength || 0) <= 0) return;
        lastFrameRef.current = 0;
        setState("playing");
    }, [totalLength]);

    const stop = useCallback(() => {
        setState("stopped");
        setDistance(0);
        lastFrameRef.current = 0;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }, []);

    const pause = useCallback(() => setState("paused"), []);

    const togglePlay = useCallback(() => {
        setState((prev) => {
            if (prev === "playing") return "paused";
            if ((totalLength || 0) <= 0) return prev;
            if (distance >= (totalLength || 0)) {
                setDistance(0);
            }
            lastFrameRef.current = 0;
            return "playing";
        });
    }, [totalLength, distance]);

    return {
        playState: state,
        playDist: distance,
        setPlayDist: setDistance,
        play,
        pause,
        togglePlay,
        stop,
        setPlayState: setState,
    };
};
