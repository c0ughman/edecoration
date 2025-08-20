#!/bin/bash

# Image Optimization Script for Edecoration
# Generates WebP and AVIF formats with responsive sizes

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🖼️  Starting image optimization...${NC}"

# Check for required tools
check_dependencies() {
    local missing_tools=()
    
    if ! command -v convert &> /dev/null; then
        missing_tools+=("ImageMagick")
    fi
    
    if ! command -v cwebp &> /dev/null; then
        missing_tools+=("WebP tools")
    fi
    
    if ! command -v avifenc &> /dev/null && ! command -v convert &> /dev/null; then
        echo -e "${YELLOW}⚠️  AVIF tools not found. Will skip AVIF generation.${NC}"
        echo -e "${YELLOW}   Install libavif-tools for AVIF support${NC}"
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        echo -e "${RED}❌ Missing required tools: ${missing_tools[*]}${NC}"
        echo -e "${YELLOW}💡 Install instructions:${NC}"
        echo -e "${YELLOW}   macOS: brew install imagemagick webp libavif${NC}"
        echo -e "${YELLOW}   Ubuntu: sudo apt install imagemagick webp libavif-tools${NC}"
        exit 1
    fi
}

# Create optimized directories
create_directories() {
    local dirs=(
        "media/optimized"
        "landing-media/optimized"
        "logos/optimized"
    )
    
    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
    done
    
    echo -e "${GREEN}✅ Created optimization directories${NC}"
}

# Optimize single image
optimize_image() {
    local input_file="$1"
    local output_dir="$2"
    local filename=$(basename "$input_file")
    local name_without_ext="${filename%.*}"
    local original_ext="${filename##*.}"
    
    echo -e "${YELLOW}🔄 Optimizing: $filename${NC}"
    
    # Define responsive sizes
    local sizes=(
        "small:480"
        "medium:768" 
        "large:1200"
    )
    
    # Create responsive versions for each format
    for size_def in "${sizes[@]}"; do
        local size_name="${size_def%:*}"
        local width="${size_def#*:}"
        
        # Original format (optimized)
        convert "$input_file" \
            -resize "${width}>" \
            -quality 85 \
            -strip \
            "$output_dir/${name_without_ext}-${size_name}.${original_ext}"
        
        # WebP format
        if command -v cwebp &> /dev/null; then
            convert "$input_file" \
                -resize "${width}>" \
                -quality 85 \
                -strip \
                "temp_${name_without_ext}.png"
            
            cwebp -q 80 "temp_${name_without_ext}.png" \
                -o "$output_dir/${name_without_ext}-${size_name}.webp"
            
            rm -f "temp_${name_without_ext}.png"
        fi
        
        # AVIF format (if available)
        if command -v avifenc &> /dev/null; then
            convert "$input_file" \
                -resize "${width}>" \
                -quality 85 \
                -strip \
                "temp_${name_without_ext}.png"
            
            avifenc --min 20 --max 30 --speed 6 \
                "temp_${name_without_ext}.png" \
                "$output_dir/${name_without_ext}-${size_name}.avif"
            
            rm -f "temp_${name_without_ext}.png"
        fi
    done
    
    echo -e "${GREEN}✅ Optimized: $filename${NC}"
}

# Process directory
process_directory() {
    local source_dir="$1"
    local target_dir="$2"
    
    echo -e "${BLUE}📁 Processing $source_dir...${NC}"
    
    # Find all image files
    find "$source_dir" -maxdepth 1 \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.webp" \) -not -path "*/optimized/*" | while read -r image; do
        optimize_image "$image" "$target_dir"
    done
}

# Calculate savings
calculate_savings() {
    echo -e "${BLUE}📊 Calculating optimization results...${NC}"
    
    local original_size=0
    local optimized_size=0
    
    # Calculate original sizes
    for dir in "media" "landing-media" "logos"; do
        if [ -d "$dir" ]; then
            local dir_size=$(find "$dir" -maxdepth 1 \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) -not -path "*/optimized/*" -exec du -b {} + 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
            original_size=$((original_size + dir_size))
        fi
    done
    
    # Calculate optimized sizes
    for dir in "media/optimized" "landing-media/optimized" "logos/optimized"; do
        if [ -d "$dir" ]; then
            local dir_size=$(find "$dir" -type f -exec du -b {} + 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
            optimized_size=$((optimized_size + dir_size))
        fi
    done
    
    # Convert to MB
    local original_mb=$(echo "scale=2; $original_size / 1024 / 1024" | bc -l 2>/dev/null || echo "0")
    local optimized_mb=$(echo "scale=2; $optimized_size / 1024 / 1024" | bc -l 2>/dev/null || echo "0")
    
    # Calculate savings percentage
    local savings_percent=0
    if [ "$original_size" -gt 0 ]; then
        savings_percent=$(echo "scale=1; (($original_size - $optimized_size) * 100) / $original_size" | bc -l 2>/dev/null || echo "0")
    fi
    
    echo -e "${GREEN}📈 Optimization Results:${NC}"
    echo -e "   Original size: ${original_mb}MB"
    echo -e "   Optimized size: ${optimized_mb}MB"
    echo -e "   Space saved: ${savings_percent}%"
}

# Main execution
main() {
    echo -e "${BLUE}🚀 Edecoration Image Optimization${NC}"
    echo -e "${BLUE}=================================${NC}"
    
    check_dependencies
    create_directories
    
    # Process each directory
    process_directory "media" "media/optimized"
    process_directory "landing-media" "landing-media/optimized"
    process_directory "logos" "logos/optimized"
    
    calculate_savings
    
    echo -e "${GREEN}🎉 Image optimization complete!${NC}"
    echo -e "${YELLOW}💡 Next steps:${NC}"
    echo -e "   1. Test image loading on your website"
    echo -e "   2. Update image references in HTML to use optimized versions"
    echo -e "   3. Monitor Core Web Vitals for improvements"
}

# Run main function
main "$@"
