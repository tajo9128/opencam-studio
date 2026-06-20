#!/bin/bash
set -e

echo "=== BioDockify Studio Deploy ==="

# 1. Build locally
echo "[1/4] Building production bundle..."
npm run build

# 2. Create remote directory
echo "[2/4] Uploading to VPS..."
ssh root@YOUR_VPS_IP "mkdir -p /var/www/BioDockify Studio"

# 3. Upload dist folder
rsync -avz --delete dist/ root@YOUR_VPS_IP:/var/www/BioDockify Studio/dist/

# 4. Upload nginx config and enable
echo "[3/4] Configuring nginx..."
scp nginx-BioDockify Studio.conf root@YOUR_VPS_IP:/etc/nginx/sites-available/BioDockify Studio
ssh root@YOUR_VPS_IP "
    ln -sf /etc/nginx/sites-available/BioDockify Studio /etc/nginx/sites-enabled/BioDockify Studio
    nginx -t && systemctl reload nginx
"

echo "[4/4] Done!"
echo "Visit: http://BioDockify Studio.biodockify.com"
echo ""
echo "To enable HTTPS, run on your VPS:"
echo "  certbot --nginx -d BioDockify Studio.biodockify.com"
