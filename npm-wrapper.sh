#!/bin/bash

# npm wrapper script for Conductor
# This script ensures npm is found and accessible

# Set up the PATH to include common npm locations
export PATH="/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/3.11/bin:/Library/Frameworks/Python.framework/Versions/3.11/lib/python3.11/site-packages/ffmpeg/bin:$PATH"

# Try to find npm in various locations
NPM_PATHS=(
    "/opt/homebrew/bin/npm"
    "/usr/local/bin/npm"
    "/Library/Frameworks/Python.framework/Versions/3.11/bin/npm"
    "/Library/Frameworks/Python.framework/Versions/3.11/lib/python3.11/site-packages/ffmpeg/npm"
    "/Library/Frameworks/Python.framework/Versions/3.11/lib/python3.11/site-packages/ffmpeg/bin/npm"
)

NPM_PATH=""
for path in "${NPM_PATHS[@]}"; do
    if [ -f "$path" ] && [ -x "$path" ]; then
        NPM_PATH="$path"
        break
    fi
done

if [ -z "$NPM_PATH" ]; then
    echo "Error: npm not found in any of the expected locations" >&2
    echo "Searched paths:" >&2
    for path in "${NPM_PATHS[@]}"; do
        echo "  $path" >&2
    done
    exit 1
fi

# Execute npm with all arguments
exec "$NPM_PATH" "$@" 