# Update Video Sources to Optimized Versions

## Files to Update

### 1. index.html
Replace these video sources:
```html
<!-- OLD -->
<source src="media/hero.mp4" type="video/mp4">

<!-- NEW -->
<source src="media/optimized/hero-optimized.webm" type="video/webm">
<source src="media/optimized/hero-optimized.mp4" type="video/mp4">
```

### 2. Gallery Videos in index.html
```html
<!-- OLD -->
<source src="landing-media/cuarto-motorizado-tambien-new.mp4" type="video/mp4">

<!-- NEW -->
<source src="landing-media/optimized/cuarto-motorizado-tambien-new-optimized.webm" type="video/webm">
<source src="landing-media/optimized/cuarto-motorizado-tambien-new-optimized.mp4" type="video/mp4">
```

### 3. Product Pages
Update all product pages to use optimized videos from `media/optimized/` directory.

## Quick Update Script

Run this command to find all video references:
```bash
grep -r "\.mp4\|\.mov\|\.MP4\|\.MOV" *.html productos/*.html
```

## Benefits After Update

1. **86% smaller file sizes**
2. **6-8x faster loading**
3. **Better mobile performance**
4. **Reduced bandwidth usage**
5. **Improved SEO scores**

## Testing

After updating, test:
1. Page load speed
2. Video playback quality
3. Mobile performance
4. Cross-browser compatibility 