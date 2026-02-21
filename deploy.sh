#!/usr/bin/env bash
set -e

INSTANCE_IP="52.31.207.242"
KEY="$(dirname "$0")/hackeurope-backend.pem"
SSH="ssh -o StrictHostKeyChecking=no -i $KEY ec2-user@$INSTANCE_IP"
SCP="scp -o StrictHostKeyChecking=no -i $KEY"
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==============================="
echo "  Deploying Backend + Frontend"
echo "==============================="

# --- Package ---
echo "[1/4] Packaging..."
tar czf /tmp/backend.tar.gz --exclude='__pycache__' --exclude='*.pyc' --exclude='user-data.sh' -C "$ROOT/backend" .
tar czf /tmp/frontend.tar.gz --exclude='node_modules' --exclude='.next' -C "$ROOT/frontend" .

# --- Upload ---
echo "[2/4] Uploading to $INSTANCE_IP..."
$SCP /tmp/backend.tar.gz /tmp/frontend.tar.gz ec2-user@$INSTANCE_IP:/tmp/

# --- Backend ---
echo "[3/4] Deploying backend..."
$SSH "cd /opt/backend && tar xzf /tmp/backend.tar.gz && python3 -m pip install --user -q -r requirements.txt && sudo systemctl restart hackeurope-backend"

# --- Frontend ---
echo "[4/4] Deploying frontend..."
$SSH "cd /opt/frontend && tar xzf /tmp/frontend.tar.gz && npm install --silent && BACKEND_URL=http://localhost:8000 npm run build && sudo systemctl restart hackeurope-frontend"

# --- Verify ---
sleep 3
echo ""
echo "=== Verification ==="
$SSH "
echo 'Backend:' \$(sudo systemctl is-active hackeurope-backend) — \$(curl -s http://localhost:8000/api/health)
echo 'Frontend:' \$(sudo systemctl is-active hackeurope-frontend) — HTTP \$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)
"

echo ""
echo "================================"
echo "  Frontend: http://$INSTANCE_IP:3000"
echo "  Backend:  http://$INSTANCE_IP:8000"
echo "================================"
