#!/usr/bin/env bash
set -e

INSTANCE_IP="52.31.207.242"
KEY="/Users/ethan/hackeurope-2026/hackeurope-backend.pem"
SSH="ssh -o StrictHostKeyChecking=no -i $KEY ec2-user@$INSTANCE_IP"

echo "==> Packaging backend..."
tar czf /tmp/backend.tar.gz --exclude='__pycache__' --exclude='*.pyc' --exclude='user-data.sh' -C "$(dirname "$0")/backend" .

echo "==> Uploading to $INSTANCE_IP..."
scp -o StrictHostKeyChecking=no -i "$KEY" /tmp/backend.tar.gz ec2-user@$INSTANCE_IP:/tmp/backend.tar.gz

echo "==> Deploying..."
$SSH "cd /opt/backend && tar xzf /tmp/backend.tar.gz && python3 -m pip install --user -q -r requirements.txt && sudo systemctl restart hackeurope-backend"

sleep 2
$SSH "sudo systemctl is-active hackeurope-backend && curl -s http://localhost:8000/api/health"

echo ""
echo "==> Backend live at http://$INSTANCE_IP:8000"
