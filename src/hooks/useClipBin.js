import { useState, useCallback } from 'react';
import { getVideoDuration } from '../utils/mediaUtils';

export const useClipBin = () => {
    const [clips, setClips] = useState([]);

    const addClip = useCallback(async (file) => {
        const url = URL.createObjectURL(file);
        const duration = await getVideoDuration(file);
        const durationStr = duration ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : '0:00';
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            setClips(prev => [...prev, {
                id: `bin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: file.name,
                url,
                duration,
                durationStr,
                resolution: `${video.videoWidth || 1920}x${video.videoHeight || 1080}`,
                size: file.size,
                type: file.type || 'video',
                file,
            }]);
            video.removeAttribute('src');
            video.load();
        };
        video.onerror = () => {
            setClips(prev => [...prev, {
                id: `bin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: file.name,
                url,
                duration,
                durationStr,
                resolution: '1920x1080',
                size: file.size,
                type: file.type || 'video',
                file,
            }]);
        };
        video.src = url;
    }, []);

    const importFiles = useCallback((files) => {
        Array.from(files).forEach(addClip);
    }, [addClip]);

    const removeClip = useCallback((id) => {
        setClips(prev => {
            const clip = prev.find(c => c.id === id);
            if (clip?.url) URL.revokeObjectURL(clip.url);
            return prev.filter(c => c.id !== id);
        });
    }, []);

    const clearAll = useCallback(() => {
        clips.forEach(c => { if (c.url) URL.revokeObjectURL(c.url); });
        setClips([]);
    }, [clips]);

    return { clips, addClip, importFiles, removeClip, clearAll };
};
