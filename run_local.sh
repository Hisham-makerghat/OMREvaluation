#!/usr/bin/env bash
# Starts the OMR tool on this computer. Needs Python 3.11 or newer.
set -e
cd "$(dirname "$0")/backend"
if [ ! -d .venv ]; then
  echo "Creating Python environment ..."
  python3 -m venv .venv
fi
source .venv/bin/activate
echo "Installing packages (first time takes a few minutes) ..."
pip install -q -r requirements.txt
export DEV_USER_EMAIL="${DEV_USER_EMAIL:-hisham@makerghat.org}"
export ADMIN_EMAILS="${ADMIN_EMAILS:-hisham@makerghat.org}"
echo
echo "Open http://127.0.0.1:8000 in your browser. Press Ctrl+C here to stop."
echo
python -m flask --app app run --port 8000
