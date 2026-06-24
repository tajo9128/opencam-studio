#!/bin/sh
cd /app
echo "[startup] Starting rtmp-relay (port 8080)..."
node rtmp-relay.js &
echo "[startup] Starting recording-server (port 8081)..."
node recording-server.js &
echo "[startup] Starting project-server (port 8082)..."
node project-server.js &
echo "[startup] Starting nginx (port 80)..."
nginx -c /etc/nginx/nginx.conf -g 'daemon off;'
