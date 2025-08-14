# Video Optimization Guide for Static Sites

## 1. Video Compression Strategy

### Target File Sizes
- **Hero videos**: 2-5MB max
- **Gallery videos**: 1-3MB max  
- **Product videos**: 500KB-2MB max
- **Background videos**: 1-3MB max

### Recommended Codecs
- **Primary**: H.264 (MP4) - 95% browser support
- **Secondary**: WebM (VP9) - 85% browser support
- **Modern**: H.265 (HEVC) - 70% browser support

### Compression Settings
```bash
# FFmpeg commands for optimization
# H.264 optimization
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset slow -c:a aac -b:a 128k output.mp4

# WebM optimization  
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libopus output.webm

# HEVC optimization
ffmpeg -i input.mp4 -c:v libx265 -crf 28 -preset slow -c:a aac -b:a 128k output.mp4
```

## 2. Responsive Video Implementation

### HTML Structure
```html
<video autoplay muted loop playsinline preload="none">
    <source src="video-small.mp4" media="(max-width: 768px)" type="video/mp4">
    <source src="video-medium.mp4" media="(max-width: 1200px)" type="video/mp4">
    <source src="video-large.mp4" type="video/mp4">
</video>
```

### CSS for Responsive Videos
```css
.video-container {
    position: relative;
    width: 100%;
    height: 0;
    padding-bottom: 56.25%; /* 16:9 aspect ratio */
}

.video-container video {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
```

## 3. Lazy Loading Implementation

### Intersection Observer API
```javascript
// Lazy load videos when they come into viewport
const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const video = entry.target;
            const source = video.querySelector('source');
            if (source && !source.src) {
                source.src = source.dataset.src;
                video.load();
                videoObserver.unobserve(video);
            }
        }
    });
}, {
    rootMargin: '50px'
});

document.querySelectorAll('video[data-lazy]').forEach(video => {
    videoObserver.observe(video);
});
```

## 4. Video Preloading Strategy

### Preload Attributes
- `preload="none"`: Don't preload (default for lazy loading)
- `preload="metadata"`: Load only metadata (recommended)
- `preload="auto"`: Load entire video (use sparingly)

## 5. CDN and Hosting Optimization

### Recommended CDN Setup
- Use CDN with video optimization (Cloudflare, AWS CloudFront)
- Enable video compression and format conversion
- Implement edge caching for videos

### File Structure
```
videos/
├── hero/
│   ├── hero-small.mp4 (768px)
│   ├── hero-medium.mp4 (1200px)
│   └── hero-large.mp4 (1920px)
├── gallery/
│   ├── gallery-small.mp4
│   └── gallery-large.mp4
└── products/
    ├── product-small.mp4
    └── product-large.mp4
```

## 6. Performance Monitoring

### Key Metrics to Track
- Time to First Byte (TTFB) for video requests
- Video loading time
- User engagement with videos
- Bandwidth usage by device type

### Tools
- WebPageTest for video performance
- Chrome DevTools Network tab
- Lighthouse for video optimization scores 