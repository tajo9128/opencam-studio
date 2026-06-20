import { useState, useEffect, useRef } from 'react';

export const useAudioLevel = (audioStream) => {
    const [level, setLevel] = useState(0);
    const intervalRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);

    useEffect(() => {
        if (!audioStream) { setLevel(0); return; }

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = audioContext;
            
            const source = audioContext.createMediaStreamSource(audioStream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            // Use setInterval instead of rAF to avoid competing with canvas render loop
            intervalRef.current = setInterval(() => {
                if (!analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                setLevel(sum / dataArray.length / 255);
            }, 100);
        } catch {
            // Audio not available
        }

        return () => {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
            setLevel(0);
        };
    }, [audioStream]);

    return level;
};
