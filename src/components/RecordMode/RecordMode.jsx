import React, { useState, useRef, useCallback } from 'react';
import { ControlBar } from '../Controls/ControlBar';
import { PreviewStage } from '../Preview/PreviewStage';
import { WelcomeModal } from '../WelcomeModal/WelcomeModal';
import { useStreams } from '../../hooks/useStreams';
import { useRecording } from '../../hooks/useRecording';
import { useAnnotation } from '../../hooks/useAnnotation';
import { useCursorFx } from '../../hooks/useCursorFx';
import { useZoom } from '../../hooks/useZoom';
import { useAudioLevel } from '../../hooks/useAudioLevel';
import { useFileSystem } from '../../hooks/useFileSystem';
import './RecordMode.css';

export const RecordMode = () => {
    const canvasRef = useRef(null);
    const screenVideoRef = useRef(null);
    const cameraVideoRef = useRef(null);

    const [activeBg, setActiveBg] = useState('none');
    const [webcamShape, setWebcamShape] = useState('circle');
    const [webcamScale, setWebcamScale] = useState(0.25);
    const [screenScale, setScreenScale] = useState(1.0);
    const [recordingQuality, setRecordingQuality] = useState('1080p');
    const [recordingFormat, setRecordingFormat] = useState('webm');
    const [sourceType, setSourceType] = useState('screen');
    const [cursorFxEnabled, setCursorFxEnabled] = useState(false);
    const [webcamOnly, setWebcamOnly] = useState(false);
    const [annotationEnabled, setAnnotationEnabled] = useState(false);
    const [zoomEnabled, setZoomEnabled] = useState(false);
    const [showWelcome, setShowWelcome] = useState(false);

    const streams = useStreams(screenVideoRef, cameraVideoRef, () => {});
    const recording = useRecording({
        screenStream: streams.screenStream,
        audioStream: streams.audioStream,
        cameraStream: streams.cameraStream,
        canvasRef,
        recordingQuality,
        bitrate: recordingQuality === '720p' ? 6000000 : recordingQuality === '2K' ? 20000000 : 12000000,
    });
    const annotation = useAnnotation(canvasRef, annotationEnabled);
    const { drawCursorFx } = useCursorFx(canvasRef, cursorFxEnabled);
    const { applyZoom, restoreZoom } = useZoom(canvasRef, zoomEnabled);
    const audioLevel = useAudioLevel(streams.audioStream);
    const fileSystem = useFileSystem();

    const QUALITY_PRESETS = {
        '720p': { width: 1280, height: 720, label: '720p' },
        '1080p': { width: 1920, height: 1080, label: '1080p' },
        '2K': { width: 2560, height: 1440, label: '2K' },
    };

    const handleStopAll = useCallback(() => {
        streams.stopAll();
        recording.stopRecording();
        setActiveBg('none');
    }, [streams, recording]);

    return (
        <div className="record-mode">
            {showWelcome && (
                <WelcomeModal onSelect={(handle) => { fileSystem.setFolderHandle(handle); setShowWelcome(false); }} />
            )}

            <div className="record-mode-preview">
                <PreviewStage
                    canvasRef={canvasRef}
                    screenVideoRef={screenVideoRef}
                    cameraVideoRef={cameraVideoRef}
                    screenStream={streams.screenStream}
                    cameraStream={streams.cameraStream}
                    activeBg={activeBg}
                    webcamShape={webcamShape}
                    webcamScale={webcamScale}
                    screenScale={screenScale}
                    isRecording={recording.isRecording}
                    isPaused={recording.isPaused}
                    webcamOnly={webcamOnly}
                    cursorFxEnabled={cursorFxEnabled}
                    drawCursorFx={drawCursorFx}
                    annotationEnabled={annotationEnabled}
                    annotationHandlers={annotationEnabled ? {
                        onMouseDown: annotation.handleMouseDown,
                        onMouseMove: annotation.handleMouseMove,
                        onMouseUp: annotation.handleMouseUp,
                    } : null}
                    zoomEnabled={zoomEnabled}
                    applyZoom={applyZoom}
                    restoreZoom={restoreZoom}
                />
            </div>

            <div className="record-mode-controls">
                <ControlBar
                    screenStream={streams.screenStream}
                    cameraStream={streams.cameraStream}
                    audioStream={streams.audioStream}
                    activeBg={activeBg}
                    isRecording={recording.isRecording}
                    webcamShape={webcamShape}
                    setWebcamShape={setWebcamShape}
                    webcamScale={webcamScale}
                    setWebcamScale={setWebcamScale}
                    screenScale={screenScale}
                    setScreenScale={setScreenScale}
                    toggleScreen={(type) => streams.toggleScreen(type)}
                    toggleCamera={streams.toggleCamera}
                    toggleMic={streams.toggleMic}
                    setActiveBg={setActiveBg}
                    recordingQuality={recordingQuality}
                    setRecordingQuality={setRecordingQuality}
                    qualityPresets={QUALITY_PRESETS}
                    startRecording={() => recording.startRecording()}
                    pauseRecording={recording.pauseRecording}
                    resumeRecording={recording.resumeRecording}
                    stopRecording={recording.stopRecording}
                    isPaused={recording.isPaused}
                    handleStopAll={handleStopAll}
                    recordingFormat={recordingFormat}
                    setRecordingFormat={setRecordingFormat}
                    changeCamera={streams.changeCamera}
                    changeMic={streams.changeMic}
                    audioLevel={audioLevel}
                    cursorFxEnabled={cursorFxEnabled}
                    setCursorFxEnabled={setCursorFxEnabled}
                    webcamOnly={webcamOnly}
                    setWebcamOnly={setWebcamOnly}
                    annotationEnabled={annotationEnabled}
                    setAnnotationEnabled={setAnnotationEnabled}
                    zoomEnabled={zoomEnabled}
                    setZoomEnabled={setZoomEnabled}
                    chatOpen={false}
                    setChatOpen={() => {}}
                    youtubeOpen={false}
                    setYoutubeOpen={() => {}}
                    filterPanelOpen={false}
                    setFilterPanelOpen={() => {}}
                    sourceType={sourceType}
                    setSourceType={setSourceType}
                    toggleSystemAudio={streams.toggleSystemAudio}
                    systemAudioStream={streams.systemAudioStream}
                />
            </div>
        </div>
    );
};
