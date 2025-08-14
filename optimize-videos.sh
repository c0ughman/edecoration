#!/bin/bash

# Video Optimization Script for Edecoration
# This script compresses videos to web-optimized formats

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "FFmpeg is not installed. Please install it first:"
    echo "macOS: brew install ffmpeg"
    echo "Ubuntu: sudo apt install ffmpeg"
    exit 1
fi

# Create optimized directories
mkdir -p media/optimized
mkdir -p landing-media/optimized

# Function to optimize video
optimize_video() {
    local input_file="$1"
    local output_dir="$2"
    local filename=$(basename "$input_file")
    local name_without_ext="${filename%.*}"
    
    echo "Optimizing: $input_file"
    
    # Create optimized version with H.264 codec
    ffmpeg -i "$input_file" \
        -c:v libx264 \
        -crf 23 \
        -preset slow \
        -c:a aac \
        -b:a 128k \
        -movflags +faststart \
        -y \
        "$output_dir/${name_without_ext}-optimized.mp4"
    
    # Create WebM version for better compression
    ffmpeg -i "$input_file" \
        -c:v libvpx-vp9 \
        -crf 30 \
        -b:v 0 \
        -c:a libopus \
        -b:a 128k \
        -y \
        "$output_dir/${name_without_ext}-optimized.webm"
    
    echo "✅ Optimized: $filename"
}

# Optimize media directory videos
echo "🔄 Optimizing media directory videos..."
find media -name "*.mp4" -o -name "*.mov" -o -name "*.MP4" -o -name "*.MOV" | while read -r video; do
    optimize_video "$video" "media/optimized"
done

# Optimize landing-media directory videos
echo "🔄 Optimizing landing-media directory videos..."
find landing-media -name "*.mp4" -o -name "*.mov" -o -name "*.MP4" -o -name "*.MOV" | while read -r video; do
    optimize_video "$video" "landing-media/optimized"
done

echo "🎉 Video optimization complete!"
echo ""
echo "📊 Optimization results:"
echo "Original size: $(du -sh media/ landing-media/ | awk '{sum+=$1} END {print sum "MB"}')"
echo "Optimized size: $(du -sh media/optimized/ landing-media/optimized/ | awk '{sum+=$1} END {print sum "MB"}')"
echo ""
echo "📁 Optimized videos are in:"
echo "  - media/optimized/"
echo "  - landing-media/optimized/"
echo ""
echo "💡 Next steps:"
echo "1. Review optimized videos for quality"
echo "2. Update HTML files to use optimized versions"
echo "3. Test performance improvements" 