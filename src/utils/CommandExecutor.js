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
                // Open the trim flow
                this.setters.showToast?.('Trim', `Trimming: ${command.start || 0}s to ${command.end || '?'}s — use Trim button in toolbar`, 'info');
                break;

            case 'zoom':
                this.setters.setZoomEnabled?.(true);
                this.setters.showToast?.('Zoom', `Zoom ${command.level || 3}x at ${command.time}s for ${command.duration}s`, 'success');
                break;

            case 'title':
            case 'title_card':
                this.setters.showToast?.('Title', `Title: "${command.text}" for ${command.duration}s`, 'info');
                break;

            case 'export_gif':
                this.setters.showToast?.('GIF Export', 'GIF export coming soon', 'info');
                break;

            case 'transcribe':
                this.setters.showToast?.('Transcribe', 'Transcription coming soon', 'info');
                break;

            case 'set_quality':
            case 'quality': {
                const q = command.quality || command.preset;
                const valid = ['720p', '1080p', '1440p'];
                if (valid.includes(q)) {
                    this.setters.setRecordingQuality?.(q);
                    this.setters.showToast?.('Quality', `Set to ${q}`, 'success');
                } else {
                    this.setters.showToast?.('Quality', `Invalid: ${q}. Use 720p, 1080p, or 1440p.`, 'error');
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
                this.setters.setAnnotationTool?.(command.tool || 'pen');
                this.setters.showToast?.('Annotation', `Switched to ${command.tool || 'pen'}`, 'success');
                break;

            case 'apply_filter': {
                const filterType = command.filter || command.type;
                const params = command.params || {};
                this.setters.addFilter?.({ type: filterType, params });
                this.setters.showToast?.('Filter', `Applied ${filterType}`, 'success');
                break;
            }

            case 'remove_filter': {
                const idx = command.index;
                this.setters.removeFilter?.(idx);
                this.setters.showToast?.('Filter', 'Removed filter', 'success');
                break;
            }

            case 'add_text':
                this.setters.addTextOverlay?.({
                    text: command.text || 'Text',
                    x: command.x || 100,
                    y: command.y || 100,
                    time: command.time || 0,
                    duration: command.duration || 5,
                });
                this.setters.showToast?.('Text', `Added: "${command.text}"`, 'success');
                break;

            case 'set_speed': {
                const speed = command.speed || 1;
                this.setters.showToast?.('Speed', `Set to ${speed}x`, 'success');
                break;
            }

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

            case 'blur_bg':
                this.setters.showToast?.('Background Blur', `Blur amount: ${command.amount || 10}`, 'info');
                break;

            case 'thumbnail':
                this.setters.showToast?.('Thumbnail', `Extract at ${command.time}s`, 'info');
                break;

            case 'description':
                this.setters.showToast?.('Description', 'Generating YouTube metadata...', 'info');
                break;

            case 'help':
            case 'chat':
                break;

            default:
                this.setters.showToast?.('AI', `Unknown: ${command.action}`, 'error');
        }
    }
}
