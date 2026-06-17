import React from 'react';

export const PreviewStage = ({
    canvasRef,
    screenStream,
    cameraStream,
    activeBg,
    screenScale,
    recordingQuality,
    isRecording,
    status,
    countdown,
    currentDimensions = { width: 0, height: 0 },
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    elapsedTime,
    webcamOnly,
    annotationEnabled,
    zoomEnabled,
    cursorFxEnabled,
    onEnableScreen,
    onEnableCamera,
    editMode = false
}) => {
    const useCanvas = editMode || cameraStream || activeBg !== 'none' || (screenScale && screenScale < 1.0) || (recordingQuality && recordingQuality !== 'native') || webcamOnly || annotationEnabled || zoomEnabled || cursorFxEnabled;
    const showPlaceholder = !editMode && !cameraStream && !screenStream;

    const videoRef = React.useRef(null);
    React.useEffect(() => {
        if (!useCanvas && screenStream && videoRef.current) {
            if (videoRef.current.srcObject !== screenStream) {
                videoRef.current.srcObject = screenStream;
                videoRef.current.play().catch(() => { });
            }
        }
    }, [screenStream, useCanvas]);

    return (
        <div className={`preview-wrapper ${isRecording ? 'is-recording' : ''}`}>
            {countdown !== null && (
                <div className="countdown-overlay">
                    <div className="countdown-number">{countdown}</div>
                </div>
            )}

            <canvas
                ref={canvasRef}
                className="preview-canvas"
                style={{
                    display: (useCanvas && !showPlaceholder) ? 'block' : 'none',
                    cursor: isRecording ? 'default' : 'move'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />

            {!useCanvas && screenStream && (
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="preview-direct-video"
                />
            )}

            {showPlaceholder && (
                <div className="preview-placeholder">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    <p>Click Start Recording to begin</p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        {onEnableScreen && <button className="btn btn-primary" onClick={onEnableScreen} style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>Start Recording</button>}
                        {onEnableCamera && <button className="btn btn-outline" onClick={onEnableCamera} style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>Add Camera</button>}
                    </div>
                </div>
            )}

            {status === 'recording' && (
                <div className="status-badge status-recording">
                    <span className="status-dot"></span>
                    REC {useCanvas ? 'CANVAS' : 'DIRECT'} {elapsedTime && `| ${elapsedTime}`}
                </div>
            )}

            {(cameraStream || screenStream) && currentDimensions?.width > 0 && (
                <div className="resolution-badge">
                    {currentDimensions.width} x {currentDimensions.height}
                </div>
            )}
        </div>
    );
};
