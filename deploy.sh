#!/bin/bash
set -e

echo "=== OpenCam Studio Deploy ==="

# 1. Build locally
echo "[1/4] Building production bundle..."
npm run build

# 2. Create remote directory
echo "[2/4] Uploading to VPS..."
ssh root@YOUR_VPS_IP "mkdir -p /var/www/opencam-studio"

# 3. Upload dist folder
rsync -avz --delete dist/ root@YOUR_VPS_IP:/var/www/opencam-studio/dist/

# 4. Upload nginx config and enable
echo "[3/4] Configuring nginx..."
scp nginx-opencam-studio.conf root@YOUR_VPS_IP:/etc/nginx/sites-available/opencam-studio
ssh root@YOUR_VPS_IP "
    ln -sf /etc/nginx/sites-available/opencam-studio /etc/nginx/sites-enabled/opencam-studio
    nginx -t && systemctl reload nginx
"

echo "[4/4] Done!"
echo "Visit: http://opencam-studio.example.com"
echo ""
echo "To enable HTTPS, run on your VPS:"
echo "  certbot --nginx -d opencam-studio.example.com"
