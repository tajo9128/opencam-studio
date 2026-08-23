#!/bin/sh
# Usage: ./server/backup-volumes.sh [backup-dir]
set -e
DIR="${1:-./backups}"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DIR"
for VOL in videos proxies projects output recordings; do
    echo "Backing up $VOL..."
    docker run --rm \
        -v "opencam-studio_${VOL}:/data:ro" \
        -v "$(cd "$DIR" && pwd):/backup" \
        alpine tar czf "/backup/${VOL}-${STAMP}.tar.gz" -C /data .
done
echo "Backups written to $DIR"
