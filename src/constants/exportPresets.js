// Export presets for common use cases
export const EXPORT_PRESETS = [
    {
        id: 'youtube-1080',
        name: 'YouTube 1080p',
        icon: 'YT',
        description: 'Standard YouTube upload',
        quality: '1080p',
        format: 'mp4-h264',
        bitrate: 8000000,
    },
    {
        id: 'youtube-720',
        name: 'YouTube 720p',
        icon: 'YT',
        description: 'Smaller YouTube upload',
        quality: '720p',
        format: 'mp4-h264',
        bitrate: 5000000,
    },
    {
        id: 'twitter',
        name: 'Twitter/X',
        icon: 'X',
        description: 'H.264, 720p, max 512MB',
        quality: '720p',
        format: 'mp4-h264',
        bitrate: 5000000,
    },
    {
        id: 'instagram',
        name: 'Instagram',
        icon: 'IG',
        description: 'Square or landscape, H.264',
        quality: '1080p',
        format: 'mp4-h264',
        bitrate: 5000000,
    },
    {
        id: 'tiktok',
        name: 'TikTok',
        icon: 'TT',
        description: 'Vertical-friendly, H.264',
        quality: '1080p',
        format: 'mp4-h264',
        bitrate: 8000000,
    },
    {
        id: 'web',
        name: 'Web Optimized',
        icon: 'WEB',
        description: 'Small file, fast loading',
        quality: '720p',
        format: 'mp4-h264',
        bitrate: 2000000,
    },
    {
        id: 'high-quality',
        name: 'High Quality',
        icon: 'HQ',
        description: 'VP9, max quality',
        quality: '1440p',
        format: 'webm-vp9',
        bitrate: 20000000,
    },
    {
        id: 'performance',
        name: 'Performance',
        icon: 'PERF',
        description: 'VP8, fast encoding',
        quality: '1080p',
        format: 'webm-vp8',
        bitrate: 6000000,
    },
];

export function getPresetById(id) {
    return EXPORT_PRESETS.find(p => p.id === id);
}
