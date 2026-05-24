import React, { useState, useRef, useEffect } from 'react';
import { SceneSwitcher } from '../Scenes/SceneSwitcher';
import { StreamPanel } from './StreamPanel';
import { MixerPanel } from '../Audio/MixerPanel';
import { useScenes } from '../../hooks/useScenes';
import { useStreams } from '../../hooks/useStreams';
import { useRecording } from '../../hooks/useRecording';
import { useStreaming } from '../../hooks/useStreaming';
import { useReplayBuffer } from '../../hooks/useReplayBuffer';
import { SourcePanel } from '../Sources/SourcePanel';
import './StreamMode.css';

export const StreamMode = () => {
    const canvasRef = useRef(null);
    const [showStreamPanel, setShowStreamPanel] = useState(false);
    const [showMixer, setShowMixer] = useState(false);
    const [showSources, setShowSources] = useState(false);

    const scenes = useScenes();
    const streams = useStreams();
    const recording = useRecording();
    const streaming = useStreaming();
    const replay = useReplayBuffer();

    // Cleanup streams on unmount when not recording/streaming
    useEffect(() => {
        return () => {
            if (!recording.isRecording && !streaming.isStreaming) streams.stopAll?.();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Guard against accidental page close during streaming/recording
    useEffect(() => {
        const active = recording.isRecording || streaming.isStreaming;
        if (!active) return;
        const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [recording.isRecording, streaming.isStreaming]);

    // Cleanup streams on unmount
    useEffect(() => {
        return () => {
            if (!recording.isRecording && !streaming.isStreaming) {
                streams.stopAll?.();
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Canvas render loop
    useEffect(() => {
        let running = true;
        const loop = () => {
            if (!running) return;
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                scenes.renderScene(ctx, canvas, scenes.activeScene, streams);
            }
            requestAnimationFrame(loop);
        };
        loop();
        return () => { running = false; };
    }, [scenes, streams]);

    // Auto-set first scene active
    useEffect(() => {
        if (!scenes.activeSceneId && scenes.scenes.length > 0) {
            scenes.setActiveSceneId(scenes.scenes[0].id);
        }
    }, [scenes]);

    const handleStartReplay = () => {
        if (canvasRef.current) {
            replay.startBuffering(canvasRef.current, streams.audioStream);
        }
    };

    return (
        <div className="stream-mode">
            <SceneSwitcher
                scenes={scenes.scenes}
                activeSceneId={scenes.activeSceneId}
                onSelectScene={scenes.setActiveSceneId}
                onAddScene={scenes.addScene}
            />

            <div className="stream-mode-main">
                {showSources && (
                    <SourcePanel
                        scene={scenes.activeScene}
                        onAddSource={(data) => scenes.addSource(scenes.activeSceneId, data)}
                        onRemoveSource={(id) => scenes.removeSource(scenes.activeSceneId, id)}
                        onUpdateSource={(id, updates) => scenes.updateSource(scenes.activeSceneId, id, updates)}
                        onClose={() => setShowSources(false)}
                    />
                )}

                <div className="stream-mode-preview">
                    <canvas
                        ref={canvasRef}
                        width={1920}
                        height={1080}
                        className="stream-canvas"
                    />
                </div>
            </div>

            <div className="stream-mode-controls">
                <div className="stream-ctrl-left">
                    <button className={`stream-ctrl-btn ${showSources ? 'active' : ''}`} onClick={() => setShowSources(!showSources)}>Sources</button>
                    <button className={`stream-ctrl-btn ${showMixer ? 'active' : ''}`} onClick={() => setShowMixer(!showMixer)}>Mixer</button>
                </div>

                <div className="stream-ctrl-center">
                    {!recording.isRecording ? (
                        <button className="stream-ctrl-record" onClick={() => {
                            if (canvasRef.current) recording.startRecording(canvasRef.current, { width: 1920, height: 1080, bitrate: 8000000 });
                        }}>
                            Record
                        </button>
                    ) : (
                        <button className="stream-ctrl-record recording" onClick={recording.stopRecording}>
                            Stop
                        </button>
                    )}

                    {!streaming.isStreaming ? (
                        <button className="stream-ctrl-live" onClick={() => setShowStreamPanel(true)}>Go Live</button>
                    ) : (
                        <button className="stream-ctrl-live streaming" onClick={streaming.stopStream}>End</button>
                    )}

                    {!replay.isBuffering ? (
                        <button className="stream-ctrl-replay" onClick={handleStartReplay}>Buffer</button>
                    ) : (
                        <button className="stream-ctrl-replay active" onClick={replay.saveReplay}>Save Replay</button>
                    )}
                </div>

                <div className="stream-ctrl-right">
                    {streaming.isStreaming && (
                        <div className="stream-ctrl-status live">
                            <span className="stream-ctrl-dot" /> LIVE
                        </div>
                    )}
                    {recording.isRecording && (
                        <div className="stream-ctrl-status rec">
                            <span className="stream-ctrl-dot red" /> REC
                        </div>
                    )}
                </div>
            </div>

            <StreamPanel
                isOpen={showStreamPanel}
                onClose={() => setShowStreamPanel(false)}
                isStreaming={streaming.isStreaming}
                isConnecting={streaming.isConnecting}
                streamError={streaming.streamError}
                streamStats={streaming.streamStats}
                platform={streaming.platform}
                selectPlatform={streaming.selectPlatform}
                streamKey={streaming.streamKey}
                setStreamKey={streaming.setStreamKey}
                rtmpUrl={streaming.rtmpUrl}
                setRtmpUrl={streaming.setRtmpUrl}
                relayUrl={streaming.relayUrl}
                setRelayUrl={streaming.setRelayUrl}
                resolution={streaming.resolution}
                setResolution={streaming.setResolution}
                bitrate={streaming.bitrate}
                setBitrate={streaming.setBitrate}
                onStartStream={streaming.startStream}
                onStopStream={streaming.stopStream}
                onCheckRelay={streaming.checkRelay}
                canvasRef={canvasRef}
                audioStream={streams.audioStream}
            />

            <MixerPanel
                isOpen={showMixer}
                onClose={() => setShowMixer(false)}
                scenes={scenes.scenes}
                activeSceneId={scenes.activeSceneId}
                onUpdateSource={scenes.updateSource}
            />
        </div>
    );
};
