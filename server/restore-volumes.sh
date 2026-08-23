#!/bin/sh
# Usage: ./server/restore-volumes.sh <backup-dir> <timestamp>
set -e
DIR="${1:?backup dir required}"
STAMP="${2:?timestamp required, e.g. 20260823-101500}"
for VOL in videos proxies projects output recordings; do
    echo "Restoring $VOL..."
    docker run --rm \
        -v "opencam-studio_${VOL}:/data" \
        -v "$(cd "$DIR" && pwd):/backup:ro" \
        alpine sh -c "find /data -mindepth 1 -delete && tar xzf /backup/${VOL}-${STAMP}.tar.gz -C /data"
done
echo "Restore complete. Restart the stack."
