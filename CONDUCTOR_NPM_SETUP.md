# Conductor NPM Setup Guide

## Problem
Conductor is unable to find npm in the PATH when trying to initialize Claude Code.

## Solutions Implemented

### 1. Symlinks Created
We've created symlinks in multiple locations where Conductor might be looking for npm:

- `/usr/local/bin/npm` → `/opt/homebrew/bin/npm`
- `/usr/local/bin/node` → `/opt/homebrew/bin/node`
- `/Library/Frameworks/Python.framework/Versions/3.11/bin/npm` → `/opt/homebrew/bin/npm`
- `/Library/Frameworks/Python.framework/Versions/3.11/bin/node` → `/opt/homebrew/bin/node`
- `/Library/Frameworks/Python.framework/Versions/3.11/lib/python3.11/site-packages/ffmpeg/npm` → `/opt/homebrew/bin/npm`
- `/Library/Frameworks/Python.framework/Versions/3.11/lib/python3.11/site-packages/ffmpeg/node` → `/opt/homebrew/bin/node`
- `/Library/Frameworks/Python.framework/Versions/3.11/lib/python3.11/site-packages/ffmpeg/bin/npm` → `/opt/homebrew/bin/npm`
- `/Library/Frameworks/Python.framework/Versions/3.11/lib/python3.11/site-packages/ffmpeg/bin/node` → `/opt/homebrew/bin/node`

### 2. Wrapper Scripts Created
- `npm-wrapper.sh` - A comprehensive wrapper script that searches for npm in multiple locations
- `setup-npm.sh` - A setup script that verifies npm installation

### 3. Package.json Created
- Basic `package.json` file initialized for the project

## Testing
All symlinks and scripts have been tested and verified to work.

## Next Steps
1. **Restart Conductor** completely
2. **Try the Claude Code feature again**
3. **If still not working**, try running Conductor from Terminal with:
   ```bash
   # Option 1: Use the wrapper script
   export PATH="$(pwd):$PATH"
   alias npm="./npm-wrapper.sh"
   
   # Option 2: Set environment variables
   export PATH="/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/3.11/bin:$PATH"
   ```

## Alternative Solutions
If the above doesn't work, you can:

1. **Contact Conductor Support**: humans@conductor.build
2. **Use Terminal Workaround**: Launch Conductor from Terminal as suggested in the error message
3. **Check Conductor Documentation**: Look for specific npm setup requirements

## Verification Commands
```bash
# Test npm accessibility
npm --version
node --version

# Test wrapper script
./npm-wrapper.sh --version

# Test symlinks
ls -la /usr/local/bin/npm
ls -la /Library/Frameworks/Python.framework/Versions/3.11/bin/npm
``` 