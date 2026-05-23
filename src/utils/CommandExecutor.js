// CommandExecutor — maps AI commands to actual ScreenStudio operations
export class CommandExecutor {
    constructor(setters) {
        this.setters = setters;
    }

    execute(command) {
        if (!command || !command.action) return;

        switch (command.action) {
            case 'trim':
            case 'trim_end':
                this.setters.showToast?.('Trim', 'Trim feature coming soon — use the trim button', 'info');
                break;

            case 'zoom':
                this.setters.setZoomEnabled?.(true);
                this.setters.showToast?.('Zoom', `Zoom ${command.level || 3}x at ${command.time}s`, 'success');
                break;

            case 'title':
            case 'title_card':
                this.setters.showToast?.('Title', 'Title card feature coming soon', 'info');
                break;

            case 'export_gif':
                this.setters.showToast?.('GIF Export', 'GIF export coming soon', 'info');
                break;

            case 'transcribe':
                this.setters.showToast?.('Transcribe', 'Transcription coming soon', 'info');
                break;

            case 'set_quality': {
                const valid = ['720p', '1080p', '1440p'];
                if (valid.includes(command.quality)) {
                    this.setters.setRecordingQuality?.(command.quality);
                    this.setters.showToast?.('Quality', `Set to ${command.quality}`, 'success');
                } else {
                    this.setters.showToast?.('Quality', `Invalid: ${command.quality}. Use 720p, 1080p, or 1440p.`, 'error');
                }
                break;
            }

            case 'set_format': {
                const valid = ['mp4-h264', 'mp4', 'webm-vp9', 'webm-vp8', 'mkv'];
                const match = valid.find(f => f.includes(command.format));
                if (match) {
                    this.setters.setRecordingFormat?.(match);
                    this.setters.showToast?.('Format', `Set to ${match}`, 'success');
                } else {
                    this.setters.showToast?.('Format', `Unknown: ${command.format}`, 'error');
                }
                break;
            }

            case 'cursor_fx':
                this.setters.setCursorFxEnabled?.(command.enabled);
                this.setters.showToast?.('Cursor FX', command.enabled ? 'Enabled' : 'Disabled', 'success');
                break;

            case 'annotate':
                this.setters.setAnnotationEnabled?.(true);
                this.setters.setTool?.(command.tool || 'pen');
                this.setters.showToast?.('Annotation', `Switched to ${command.tool || 'pen'}`, 'success');
                break;

            case 'start_recording':
                this.setters.startRecording?.();
                break;

            case 'stop_recording':
                this.setters.stopRecording?.();
                break;

            case 'pause_recording':
                this.setters.pauseRecording?.();
                break;

            case 'resume_recording':
                this.setters.resumeRecording?.();
                break;

            case 'help':
            case 'chat':
                break;

            default:
                this.setters.showToast?.('AI', `Unknown: ${command.action}`, 'error');
        }
    }
}
