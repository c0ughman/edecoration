#!/bin/bash

# Setup npm environment for Conductor
export PATH="/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/3.11/bin:$PATH"

# Verify npm is accessible
if command -v npm &> /dev/null; then
    echo "npm found at: $(which npm)"
    npm --version
else
    echo "npm not found in PATH"
    echo "Current PATH: $PATH"
    exit 1
fi

# Verify node is accessible
if command -v node &> /dev/null; then
    echo "node found at: $(which node)"
    node --version
else
    echo "node not found in PATH"
    exit 1
fi 