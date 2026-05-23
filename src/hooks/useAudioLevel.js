import { useState, useEffect, useRef } from 'react';

export const useAudioLevel = (audioStream) => {
    const [level, setLevel] = useState(0);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animFrameRef = useRef(null);

    useEffect(() => {
        if (!audioStream) {
            setLevel(0);
            return;
        }

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(audioStream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const update = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const avg = sum / dataArray.length;
                setLevel(avg / 255);
                animFrameRef.current = requestAnimationFrame(update);
            };

            update();
        } catch (e) {
            // AudioContext not available
        }

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => {});
            }
        };
    }, [audioStream]);

    return level;
};
