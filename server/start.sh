#!/bin/sh
set -e

# Set directory paths for Docker
export VIDEOS_DIR=/videos
export PROXIES_DIR=/proxies
export PROJECTS_DIR=/projects
export OUTPUT_DIR=/output
export RECORDINGS_DIR=/recordings
export SIGNALING_BASE_PATH=/signaling

# Ensure .uploads temp directory exists (multer needs it)
mkdir -p /videos/.uploads

# Graceful shutdown
cleanup() {
    echo "Shutting down..."
    kill $RTMP_PID $RECORDING_PID $PROJECT_PID $SIGNALING_PID $LLM_PID 2>/dev/null
    wait $RTMP_PID $RECORDING_PID $PROJECT_PID $SIGNALING_PID $LLM_PID 2>/dev/null
    exit 0
}
trap cleanup SIGTERM SIGINT

# Start services with automatic restart
start_service() {
    local name=$1
    shift
    while true; do
        echo "Starting $name..."
        "$@" &
        local pid=$!
        wait $pid || echo "$name exited with code $?, restarting..."
        sleep 1
    done
}

# Start background services
start_service "rtmp-relay" node rtmp-relay.js &
RTMP_PID=$!

start_service "recording-server" node recording-server.js &
RECORDING_PID=$!

start_service "project-server" node project-server.js &
PROJECT_PID=$!

start_service "signaling-server" node signaling-server.js &
SIGNALING_PID=$!

# Start embedded LLM server (if model exists)
if [ -f "${LLM_MODEL_PATH:-/models/llama-3.2-3b-instruct-q4_k_m.gguf}" ]; then
    start_service "llama-server" llama-server \
        -m "${LLM_MODEL_PATH:-/models/llama-3.2-3b-instruct-q4_k_m.gguf}" \
        --host 127.0.0.1 \
        --port "${LLM_PORT:-8084}" \
        -c "${LLM_CTX_SIZE:-2048}" \
        -t "${LLM_THREADS:-4}" \
        -b 256 \
        --mlock \
        --no-webui &
    LLM_PID=$!
fi

# Start nginx in foreground
echo "Starting nginx..."
nginx -c /etc/nginx/nginx.conf -g 'daemon off;' &
NGINX_PID=$!

# Wait for any process to exit
wait -n $RTMP_PID $RECORDING_PID $PROJECT_PID $SIGNALING_PID $LLM_PID $NGINX_PID
cleanup
