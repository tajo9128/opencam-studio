// System prompt for AI command parsing
export const SYSTEM_PROMPT = `You are BioDockify Studio AI assistant. You help users edit their screen recordings, manage scenes, apply filters, and control recording using natural language commands.

When a user describes an edit, respond with ONLY a JSON command object. No explanations, no markdown.

Supported commands:

RECORDING:
- {"action":"start_recording"} — start recording
- {"action":"stop_recording"} — stop recording
- {"action":"pause_recording"} — pause recording
- {"action":"resume_recording"} — resume recording
- {"action":"set_quality","quality":"1080p"} — change quality (720p/1080p/1440p)
- {"action":"set_format","format":"webm"} — change format (webm/mp4/mkv)

EDITING:
- {"action":"trim","start":0,"end":5} — trim from start to end seconds
- {"action":"trim","start":"0:30","end":"1:15"} — trim with timestamps
- {"action":"split"} — split clip at playhead
- {"action":"set_speed","speed":2} — set clip speed (0.25 to 4)
- {"action":"delete_clip"} — delete selected clip
- {"action":"duplicate_clip"} — duplicate selected clip

ZOOM/CURSOR:
- {"action":"zoom","time":30,"duration":3,"level":3} — add zoom at timestamp
- {"action":"cursor_fx","enabled":true} — toggle cursor highlight/click effects

FILTERS (33 available):
- {"action":"apply_filter","filter":"brightness","params":{"value":20}} — apply filter
- {"action":"apply_filter","filter":"blur","params":{"radius":5}}
- {"action":"apply_filter","filter":"sepia"}
- {"action":"apply_filter","filter":"grayscale"}
- {"action":"apply_filter","filter":"contrast","params":{"value":30}}
- {"action":"apply_filter","filter":"saturation","params":{"value":20}}
- {"action":"apply_filter","filter":"hue","params":{"degrees":90}}
- {"action":"apply_filter","filter":"vignette","params":{"strength":50}}
- {"action":"apply_filter","filter":"noise","params":{"amount":30}}
- {"action":"apply_filter","filter":"pixelate","params":{"size":8}}
- {"action":"apply_filter","filter":"posterize","params":{"levels":4}}
- {"action":"apply_filter","filter":"glow","params":{"radius":10,"intensity":50}}
- {"action":"apply_filter","filter":"oldfilm","params":{"scratch":30,"grain":40}}
- {"action":"apply_filter","filter":"cartoon","params":{"edges":50,"levels":6}}
- {"action":"apply_filter","filter":"emboss","params":{"depth":2}}
- {"action":"apply_filter","filter":"charcoal"}
- {"action":"apply_filter","filter":"filmgrain","params":{"amount":30}}
- {"action":"apply_filter","filter":"levels","params":{"inLow":0,"inHigh":255,"gamma":100}}
- {"action":"apply_filter","filter":"liftgammagain","params":{"lift":0,"gamma":100,"gain":100}}
- {"action":"apply_filter","filter":"curves","params":{"redMid":0,"greenMid":0,"blueMid":0}}
- {"action":"apply_filter","filter":"temperature","params":{"value":30}}
- {"action":"apply_filter","filter":"mirror"}
- {"action":"apply_filter","filter":"invert"}
- {"action":"apply_filter","filter":"chromakey","params":{"color":"#00ff00","similarity":30}}
- {"action":"remove_filter","filter":"brightness"} — remove a filter by name
- {"action":"remove_all_filters"} — remove all filters

TRANSITIONS (13 available):
- {"action":"set_transition","type":"crossfade"} — set transition on selected clip
- {"action":"set_transition","type":"fadeBlack"}
- {"action":"set_transition","type":"wipeLeft"}
- {"action":"set_transition","type":"wipeRight"}
- {"action":"set_transition","type":"dissolve"}
- {"action":"set_transition","type":"barnDoor"}
- {"action":"set_transition","type":"iris"}
- {"action":"set_transition","type":"clockWipe"}
- {"action":"set_transition","type":"push"}

KEYFRAMES:
- {"action":"add_keyframe","param":"brightness.value","time":0,"value":0,"interpolation":"linear"}
- {"action":"add_keyframe","param":"brightness.value","time":5,"value":50}
- {"action":"remove_keyframe","param":"brightness.value","time":5}

SCENES:
- {"action":"switch_scene","scene":"Screen Only"} — switch to named scene
- {"action":"switch_scene","scene":"Camera + Screen PiP"}
- {"action":"add_scene","name":"My Scene"} — create new scene
- {"action":"add_source","type":"text","name":"Title","config":{"text":"Hello","fontSize":32}}

TEXT/TITLES:
- {"action":"title","text":"Hello World","duration":5,"position":"start"} — add title overlay
- {"action":"add_text","text":"Subtitle","x":100,"y":900,"duration":3} — add text overlay

SUBTITLES:
- {"action":"transcribe"} — auto-generate subtitles from audio
- {"action":"add_subtitle","start":0,"end":5,"text":"Hello world"} — add subtitle

AUDIO:
- {"action":"set_volume","volume":80} — set volume (0-150)
- {"action":"mute"} / {"action":"unmute"} — mute/unmute
- {"action":"apply_audio_effect","effect":"reverb","params":{"time":1.5,"mix":0.3}}
- {"action":"apply_audio_effect","effect":"noiseGate","params":{"threshold":-40}}
- {"action":"apply_audio_effect","effect":"highpass","params":{"frequency":80}}
- {"action":"remove_audio_effect","effect":"reverb"}

ANNOTATION:
- {"action":"annotate","tool":"pen","color":"red"} — switch annotation tool
- {"action":"annotate","tool":"arrow"}
- {"action":"annotate","tool":"rectangle"}
- {"action":"annotate","tool":"text"}

EXPORT:
- {"action":"export_gif","maxDuration":10} — export as GIF
- {"action":"thumbnail","time":5} — extract thumbnail at time
- {"action":"description"} — generate YouTube metadata

HELP:
- {"action":"help"} — show available commands

If the user asks something unrelated to video editing, respond with:
{"action":"chat","message":"I can help you edit recordings. Try: 'trim first 5 seconds', 'add sepia filter', 'set speed to 2x', or type 'help' for all commands."}`;

// Command patterns for local parsing (no LLM needed)
export const COMMAND_PATTERNS = [
    // Recording
    {
        patterns: [/(?:start|begin)\s+recording/i],
        handler: () => ({ action: 'start_recording' })
    },
    {
        patterns: [/(?:stop|end)\s+recording/i],
        handler: () => ({ action: 'stop_recording' })
    },
    {
        patterns: [/(?:pause)\s+recording/i],
        handler: () => ({ action: 'pause_recording' })
    },
    {
        patterns: [/(?:resume|continue)\s+recording/i],
        handler: () => ({ action: 'resume_recording' })
    },
    // Trim
    {
        patterns: [/trim\s+(?:the\s+)?first\s+(\d+)\s*(?:s|sec|seconds?)/i, /cut\s+(?:the\s+)?first\s+(\d+)\s*(?:s|sec|seconds?)/i],
        handler: (match) => ({ action: 'trim', start: 0, end: parseInt(match[1]) })
    },
    {
        patterns: [/trim\s+(?:the\s+)?last\s+(\d+)\s*(?:s|sec|seconds?)/i, /cut\s+(?:the\s+)?last\s+(\d+)\s*(?:s|sec|seconds?)/i],
        handler: (match) => ({ action: 'trim_end', seconds: parseInt(match[1]) })
    },
    {
        patterns: [/trim\s+(?:from\s+)?(\d+):(\d+)\s+(?:to\s+)?(\d+):(\d+)/i],
        handler: (match) => ({
            action: 'trim',
            start: parseInt(match[1]) * 60 + parseInt(match[2]),
            end: parseInt(match[3]) * 60 + parseInt(match[4])
        })
    },
    // Split
    {
        patterns: [/split\s+(?:at\s+)?(?:playhead|here|current)/i, /split\s+(?:the\s+)?clip/i],
        handler: () => ({ action: 'split' })
    },
    // Speed
    {
        patterns: [/set\s+speed\s+(?:to\s+)?(\d+(?:\.\d+)?)x?/i, /speed\s+(?:to\s+)?(\d+(?:\.\d+)?)x?/i, /(\d+(?:\.\d+)?)x\s+speed/i],
        handler: (match) => ({ action: 'set_speed', speed: parseFloat(match[1]) })
    },
    // Zoom
    {
        patterns: [/zoom\s+(?:at|to)\s+(\d+):(\d+)\s*(?:for\s+)?(\d+)\s*(?:s|sec|seconds?)?/i],
        handler: (match) => ({
            action: 'zoom',
            time: parseInt(match[1]) * 60 + parseInt(match[2]),
            duration: parseInt(match[3]),
            level: 3
        })
    },
    {
        patterns: [/zoom\s+(?:at|to)\s+(\d+)\s*(?:s|sec|seconds?)\s*(?:for\s+)?(\d+)\s*(?:s|sec|seconds?)?/i],
        handler: (match) => ({
            action: 'zoom',
            time: parseInt(match[1]),
            duration: parseInt(match[2]),
            level: 3
        })
    },
    // Title
    {
        patterns: [/add\s+(?:a\s+)?title\s*[:"]?\s*(.+?)["']?\s*(?:for\s+)?(\d+)\s*(?:s|sec|seconds?)?/i],
        handler: (match) => ({
            action: 'title',
            text: match[1].trim(),
            duration: parseInt(match[2]) || 3,
            position: 'start'
        })
    },
    // Filters — quick apply via local regex (no LLM needed)
    {
        patterns: [/apply\s+(?:a\s+)?(?:sepia|grayscale|greyscale|invert|mirror|charcoal)\s*(?:filter)?/i, /(?:add|enable)\s+(sepia|grayscale|greyscale|invert|mirror|charcoal)\s*(?:filter)?/i],
        handler: (match) => {
            const filterMap = { 'greyscale': 'grayscale' };
            const name = match[1]?.toLowerCase() || match[0].match(/(sepia|grayscale|greyscale|invert|mirror|charcoal)/i)?.[1]?.toLowerCase();
            return { action: 'apply_filter', filter: filterMap[name] || name };
        }
    },
    {
        patterns: [/remove\s+(?:all\s+)?filters?/i, /clear\s+filters?/i, /reset\s+filters?/i],
        handler: () => ({ action: 'remove_all_filters' })
    },
    {
        patterns: [/apply\s+brightness\s*(?:by\s+|of\s+|to\s+)?([+-]?\d+)/i, /brightness\s+([+-]?\d+)/i],
        handler: (match) => ({ action: 'apply_filter', filter: 'brightness', params: { value: parseInt(match[1]) } })
    },
    {
        patterns: [/apply\s+contrast\s*(?:by\s+|of\s+|to\s+)?([+-]?\d+)/i, /contrast\s+([+-]?\d+)/i],
        handler: (match) => ({ action: 'apply_filter', filter: 'contrast', params: { value: parseInt(match[1]) } })
    },
    {
        patterns: [/apply\s+(?:a\s+)?blur\s*(?:of\s+|with\s+)?(\d+)/i, /blur\s+(\d+)/i],
        handler: (match) => ({ action: 'apply_filter', filter: 'blur', params: { radius: parseInt(match[1]) } })
    },
    // Volume
    {
        patterns: [/set\s+volume\s+(?:to\s+)?(\d+)/i, /volume\s+(\d+)/i],
        handler: (match) => ({ action: 'set_volume', volume: parseInt(match[1]) })
    },
    {
        patterns: [/\bmute\b/i],
        handler: () => ({ action: 'mute' })
    },
    {
        patterns: [/\bunmute\b/i],
        handler: () => ({ action: 'unmute' })
    },
    // Scene
    {
        patterns: [/switch\s+(?:to\s+)?scene\s*[:"]?\s*(.+?)["']?\s*$/i],
        handler: (match) => ({ action: 'switch_scene', scene: match[1].trim() })
    },
    // Annotation
    {
        patterns: [/(?:enable|turn\s+on)\s+(?:drawing|annotations?)/i, /(?:switch|select)\s+(?:to\s+)?(?:pen|pencil)/i],
        handler: () => ({ action: 'annotate', tool: 'pen' })
    },
    {
        patterns: [/select\s+(?:the\s+)?(?:arrow|line|rectangle|text|eraser)\s*(?:tool)?/i, /(?:switch|select)\s+(?:to\s+)?(arrow|line|rect|rectangle|text|eraser)/i],
        handler: (match) => ({ action: 'annotate', tool: match[1].toLowerCase() })
    },
    // Cursor FX
    {
        patterns: [/(?:enable|turn\s+on|show)\s+cursor\s*(?:effects?|fx)?/i],
        handler: () => ({ action: 'cursor_fx', enabled: true })
    },
    {
        patterns: [/(?:disable|turn\s+off|hide)\s+cursor\s*(?:effects?|fx)?/i],
        handler: () => ({ action: 'cursor_fx', enabled: false })
    },
    // Quality
    {
        patterns: [/set\s+quality\s+(?:to\s+)?(\w+)/i, /record\s+(?:in\s+)?(\d+p)/i, /(\d+p)\s+quality/i],
        handler: (match) => {
            const q = match[1].toLowerCase();
            const map = { '720': '720p', '720p': '720p', '1080': '1080p', '1080p': '1080p', '1440': '1440p', '1440p': '1440p', '2k': '1440p' };
            return { action: 'set_quality', quality: map[q] || q };
        }
    },
    // Format
    {
        patterns: [/set\s+format\s+(?:to\s+)?(\w+)/i, /(?:export|save)\s+as\s+(\w+)/i],
        handler: (match) => ({ action: 'set_format', format: match[1].toLowerCase() })
    },
    // GIF
    {
        patterns: [/(?:export|save|convert)\s+(?:as\s+)?gif/i, /make\s+(?:a\s+)?gif/i],
        handler: () => ({ action: 'export_gif', maxDuration: 10 })
    },
    // Subtitles
    {
        patterns: [/(?:transcribe|subtitles?|caption|srt|auto\s*caption)/i],
        handler: () => ({ action: 'transcribe' })
    },
    // Help
    {
        patterns: [/^help$/i, /^what can you do$/i, /^commands$/i],
        handler: () => ({ action: 'help' })
    },
];

export const HELP_MESSAGE = `Here's what I can do:

**Recording:**
- "Start recording" / "Stop recording" / "Pause"
- "Set quality to 1080p"
- "Set format to webm"

**Editing:**
- "Trim first 5 seconds" / "Trim last 10 seconds"
- "Trim from 0:30 to 1:15"
- "Split clip" / "Delete clip"
- "Set speed to 2x" / "Speed 0.5x"

**Filters (33 available):**
- "Apply sepia" / "Apply grayscale" / "Apply blur 5"
- "Brightness 20" / "Contrast 30"
- "Apply glow" / "Apply oldfilm" / "Apply cartoon"
- "Apply chromakey" (green screen)
- "Remove all filters"

**Transitions (13):**
- "Set transition to crossfade"
- "Set transition to dissolve" / "wipeLeft" / "iris"

**Zoom & Cursor:**
- "Zoom at 0:30 for 3 seconds"
- "Enable cursor effects" / "Disable cursor effects"

**Scenes:**
- "Switch to scene Screen Only"
- "Switch to scene Camera + Screen PiP"

**Audio:**
- "Set volume to 80" / "Mute" / "Unmute"
- "Apply reverb" / "Apply noise gate"

**Text:**
- "Add title Hello World for 5 seconds"
- "Select pen tool" / "arrow" / "rectangle"

**Subtitles:**
- "Transcribe" (auto-generate subtitles)
- "Add subtitle" at specific times

**Export:**
- "Export as GIF"
- "Extract thumbnail at 5s"`;
