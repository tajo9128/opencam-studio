#!/bin/sh
set -e

# Graceful shutdown
cleanup() {
    echo "Shutting down..."
    kill $RTMP_PID $RECORDING_PID $PROJECT_PID 2>/dev/null
    wait $RTMP_PID $RECORDING_PID $PROJECT_PID 2>/dev/null
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

# Start nginx in foreground
echo "Starting nginx..."
nginx -c /etc/nginx/nginx.conf -g 'daemon off;' &
NGINX_PID=$!

# Wait for any process to exit
wait -n $RTMP_PID $RECORDING_PID $PROJECT_PID $NGINX_PID
cleanup
