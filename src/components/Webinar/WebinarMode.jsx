import React, { useState, useRef, useCallback } from 'react';
import { useScenes } from '../../hooks/useScenes';
import { useStreams } from '../../hooks/useStreams';
import { useRecording } from '../../hooks/useRecording';
import { useStreaming } from '../../hooks/useStreaming';
import { useReplayBuffer } from '../../hooks/useReplayBuffer';
import { SceneSwitcher } from '../Scenes/SceneSwitcher';
import { StreamPanel } from '../Streaming/StreamPanel';
import { MixerPanel } from '../Audio/MixerPanel';
import { renderTitleTemplate } from '../../utils/TitleTemplates';
import './WebinarMode.css';

export const WebinarMode = () => {
    const canvasRef = useRef(null);
    const screenVideoRef = useRef(null);
    const cameraVideoRef = useRef(null);
    const [showStreamPanel, setShowStreamPanel] = useState(false);
    const [showMixer, setShowMixer] = useState(false);
    const [showLowerThird, setShowLowerThird] = useState(true);
    const [lowerThirdName, setLowerThirdName] = useState('Speaker Name');
    const [lowerThirdTitle, setLowerThirdTitle] = useState('Title / Role');
    const [qnaItems] = useState([]);
    const [showQna, setShowQna] = useState(false);

    const scenes = useScenes();
    const streams = useStreams(screenVideoRef, cameraVideoRef, () => {});
    const recording = useRecording({
        screenStream: streams?.screenStream,
        cameraStream: streams?.cameraStream,
        canvasRef,
    });
    const streaming = useStreaming();
    const replay = useReplayBuffer();

    // Render loop
    const renderFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        scenes.renderScene(ctx, canvas, scenes.activeScene, streams);

        // Lower third overlay
        if (showLowerThird && (lowerThirdName || lowerThirdTitle)) {
            renderTitleTemplate('lowerThird', ctx, canvas, {
                name: lowerThirdName,
                title: lowerThirdTitle,
            });
        }

        // Q&A overlay
        if (showQna && qnaItems.length > 0) {
            const latest = qnaItems[0];
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            const boxY = canvas.height * 0.05;
            ctx.fillRect(canvas.width * 0.02, boxY, canvas.width * 0.4, 60);
            ctx.fillStyle = '#f59e0b';
            ctx.font = 'bold 14px Outfit, sans-serif';
            ctx.fillText('Q:', canvas.width * 0.03, boxY + 22);
            ctx.fillStyle = '#ffffff';
            ctx.font = '14px Outfit, sans-serif';
            ctx.fillText(latest.question?.slice(0, 60) || '', canvas.width * 0.05, boxY + 22);
            if (latest.answer) {
                ctx.fillStyle = '#10b981';
                ctx.font = 'bold 14px Outfit, sans-serif';
                ctx.fillText('A:', canvas.width * 0.03, boxY + 46);
                ctx.fillStyle = '#e2e8f0';
                ctx.font = '14px Outfit, sans-serif';
                ctx.fillText(latest.answer?.slice(0, 60) || '', canvas.width * 0.05, boxY + 46);
            }
            ctx.restore();
        }
    }, [scenes, streams, showLowerThird, lowerThirdName, lowerThirdTitle, showQna, qnaItems]);

    // Animation loop
    React.useEffect(() => {
        let running = true;
        const loop = () => {
            if (!running) return;
            renderFrame();
            requestAnimationFrame(loop);
        };
        loop();
        return () => { running = false; };
    }, [renderFrame]);

    return (
        <div className="webinar-mode">
            {/* Scene Switcher */}
            <SceneSwitcher
                scenes={scenes.scenes}
                activeSceneId={scenes.activeSceneId}
                onSelectScene={scenes.setActiveSceneId}
                onAddScene={scenes.addScene}
            />

            <div className="webinar-main">
                {/* Canvas Preview */}
                <div className="webinar-preview">
                    <canvas
                        ref={canvasRef}
                        width={1920}
                        height={1080}
                        className="webinar-canvas"
                    />

                    {/* Lower Third Config */}
                    {showLowerThird && (
                        <div className="webinar-lower-third-config">
                            <input
                                className="webinar-lt-input"
                                value={lowerThirdName}
                                onChange={e => setLowerThirdName(e.target.value)}
                                placeholder="Name"
                            />
                            <input
                                className="webinar-lt-input"
                                value={lowerThirdTitle}
                                onChange={e => setLowerThirdTitle(e.target.value)}
                                placeholder="Title"
                            />
                        </div>
                    )}
                </div>

                {/* Webinar Controls */}
                <div className="webinar-controls">
                    <div className="webinar-controls-left">
                        <button
                            className={`webinar-btn ${showLowerThird ? 'active' : ''}`}
                            onClick={() => setShowLowerThird(!showLowerThird)}
                        >
                            Lower Third
                        </button>
                        <button
                            className={`webinar-btn ${showQna ? 'active' : ''}`}
                            onClick={() => setShowQna(!showQna)}
                        >
                            Q&A
                        </button>
                        <button
                            className={`webinar-btn ${showMixer ? 'active' : ''}`}
                            onClick={() => setShowMixer(!showMixer)}
                        >
                            Mixer
                        </button>
                    </div>

                    <div className="webinar-controls-center">
                        {recording.isRecording ? (
                            <button className="webinar-record-btn recording" onClick={recording.stopRecording}>
                                Stop Recording
                            </button>
                        ) : (
                            <button className="webinar-record-btn" onClick={() => {
                                if (canvasRef.current) recording.startRecording(canvasRef.current, { width: 1920, height: 1080, bitrate: 8000000 });
                            }}>
                                Record
                            </button>
                        )}

                        {streaming.isStreaming ? (
                            <button className="webinar-stream-btn streaming" onClick={streaming.stopStream}>
                                End Stream
                            </button>
                        ) : (
                            <button className="webinar-stream-btn" onClick={() => setShowStreamPanel(true)}>
                                Go Live
                            </button>
                        )}

                        {replay.isBuffering && (
                            <button className="webinar-replay-btn" onClick={replay.saveReplay}>
                                Save Replay
                            </button>
                        )}
                    </div>

                    <div className="webinar-controls-right">
                        {streaming.isStreaming && (
                            <div className="webinar-live-indicator">
                                <span className="webinar-live-dot" />
                                LIVE ({Math.floor(streaming.streamStats.uptime / 60)}:{String(Math.floor(streaming.streamStats.uptime % 60)).padStart(2, '0')})
                            </div>
                        )}
                        {recording.isRecording && (
                            <div className="webinar-rec-indicator">
                                <span className="webinar-rec-dot" />
                                REC
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Stream Panel */}
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

            {/* Mixer Panel */}
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
