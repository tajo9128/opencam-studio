import React from 'react';

export const PreviewStage = ({
    canvasRef,
    screenVideoRef,
    cameraVideoRef,
    cameraStream,
    screenStream,
    activeBg,
    screenScale,
    recordingQuality,
    isRecording,
    status,
    countdown,
    currentDimensions = { width: 0, height: 0 },
    handleMouseDown,
    handleMouseMove,
    handleMouseUp
}) => {
    // Determine if we should show the Canvas or the Direct Video Feed
    const useCanvas = cameraStream || activeBg !== 'none' || (screenScale && screenScale < 1.0) || (recordingQuality && recordingQuality !== 'native');
    const showPlaceholder = !cameraStream && !screenStream;

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

            {/* 1. Canvas Mode: Show when using Webcam, Backgrounds, or Frames */}
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
                <div className="preview-placeholder">Sources Inactive — Enable Screen or Camera to start</div>
            )}

            {status === 'recording' && (
                <div className="status-badge status-recording">
                    <span className="status-dot"></span>
                    REC {useCanvas ? 'CANVAS' : 'DIRECT'}
                </div>
            )}

            {(cameraStream || screenStream) && currentDimensions?.width > 0 && (
                <div className="resolution-badge">
                    {currentDimensions.width} × {currentDimensions.height}
                </div>
            )}
        </div>
    );
};
