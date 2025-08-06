#!/bin/bash

# Launch Conductor from Terminal with proper npm environment
echo "Setting up environment for Conductor..."

# Set up the PATH to include npm locations
export PATH="/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/3.11/bin:/Library/Frameworks/Python.framework/Versions/3.11/lib/python3.11/site-packages/ffmpeg/bin:$PATH"

# Verify npm is accessible
if command -v npm &> /dev/null; then
    echo "✅ npm found at: $(which npm)"
    echo "✅ npm version: $(npm --version)"
else
    echo "❌ npm not found in PATH"
    echo "Current PATH: $PATH"
    exit 1
fi

# Verify node is accessible
if command -v node &> /dev/null; then
    echo "✅ node found at: $(which node)"
    echo "✅ node version: $(node --version)"
else
    echo "❌ node not found in PATH"
    exit 1
fi

echo ""
echo "🚀 Launching Conductor..."
echo "Note: Conductor will open in a new window. You can close this terminal once it's running."
echo ""

# Launch Conductor
/Applications/Conductor.app/Contents/MacOS/conductor 