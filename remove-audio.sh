#!/bin/bash

# Function to process a video file
process_video() {
    local input_file="$1"
    local temp_file="${input_file%.*}_noaudio_temp.${input_file##*.}"
    local backup_file="${input_file%.*}_backup.${input_file##*.}"
    
    echo "Processing: $input_file"
    
    # Create a version without audio
    ffmpeg -i "$input_file" -c:v copy -an "$temp_file" -y
    
    if [ $? -eq 0 ]; then
        # Backup original
        mv "$input_file" "$backup_file"
        # Move new version to original location
        mv "$temp_file" "$input_file"
        echo "✓ Successfully processed: $input_file"
    else
        echo "✗ Failed to process: $input_file"
        # Clean up temp file if it exists
        rm -f "$temp_file"
    fi
}

# Find and process all video files
find . -type f \( -iname "*.mp4" -o -iname "*.mov" -o -iname "*.MP4" -o -iname "*.MOV" \) | while read -r file; do
    process_video "$file"
done

echo "All videos have been processed. Original files have been backed up with '_backup' suffix."
