# CDN and Performance Optimization Guide

## 🚀 CDN Setup Recommendations

### 1. Cloudflare Setup (Recommended)
```bash
# DNS Records to add:
# CNAME www -> your-domain.com
# A @ -> your-server-ip

# Page Rules to configure:
1. *.jpg, *.jpeg, *.png, *.webp, *.avif
   - Cache Level: Cache Everything
   - Edge Cache TTL: 1 month
   - Browser Cache TTL: 1 week

2. *.mp4, *.webm, *.mov
   - Cache Level: Cache Everything  
   - Edge Cache TTL: 1 month
   - Browser Cache TTL: 1 week

3. *.css, *.js
   - Cache Level: Cache Everything
   - Edge Cache TTL: 1 week
   - Browser Cache TTL: 1 day
```

### 2. Alternative CDN Options
- **AWS CloudFront**: Best for complex caching rules
- **Cloudinary**: Specialized for image/video optimization
- **KeyCDN**: Budget-friendly option
- **BunnyCDN**: High performance, low cost

## 🔧 Server-Side Optimizations

### Apache .htaccess
```apache
# Browser Caching
<IfModule mod_expires.c>
    ExpiresActive on
    
    # Images
    ExpiresByType image/jpg "access plus 1 month"
    ExpiresByType image/jpeg "access plus 1 month"
    ExpiresByType image/gif "access plus 1 month"
    ExpiresByType image/png "access plus 1 month"
    ExpiresByType image/webp "access plus 1 month"
    ExpiresByType image/avif "access plus 1 month"
    
    # Videos
    ExpiresByType video/mp4 "access plus 1 month"
    ExpiresByType video/webm "access plus 1 month"
    
    # Fonts
    ExpiresByType application/font-woff2 "access plus 1 year"
    ExpiresByType font/woff2 "access plus 1 year"
    
    # CSS and JavaScript
    ExpiresByType text/css "access plus 1 week"
    ExpiresByType application/javascript "access plus 1 week"
    
    # HTML
    ExpiresByType text/html "access plus 1 day"
</IfModule>

# Compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/plain
    AddOutputFilterByType DEFLATE text/html
    AddOutputFilterByType DEFLATE text/xml
    AddOutputFilterByType DEFLATE text/css
    AddOutputFilterByType DEFLATE application/xml
    AddOutputFilterByType DEFLATE application/xhtml+xml
    AddOutputFilterByType DEFLATE application/rss+xml
    AddOutputFilterByType DEFLATE application/javascript
    AddOutputFilterByType DEFLATE application/x-javascript
</IfModule>

# Image Format Negotiation
<IfModule mod_rewrite.c>
    RewriteEngine On
    
    # Serve WebP images if supported
    RewriteCond %{HTTP_ACCEPT} image/webp
    RewriteCond %{REQUEST_FILENAME} \.(jpe?g|png)$
    RewriteCond %{REQUEST_FILENAME}\.webp -f
    RewriteRule ^(.+)\.(jpe?g|png)$ $1.$2.webp [T=image/webp,E=accept:1]
    
    # Serve AVIF images if supported
    RewriteCond %{HTTP_ACCEPT} image/avif
    RewriteCond %{REQUEST_FILENAME} \.(jpe?g|png)$
    RewriteCond %{REQUEST_FILENAME}\.avif -f
    RewriteRule ^(.+)\.(jpe?g|png)$ $1.$2.avif [T=image/avif,E=accept:1]
</IfModule>
```

### Nginx Configuration
```nginx
# Caching
location ~* \.(jpg|jpeg|png|gif|ico|css|js|webp|avif)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location ~* \.(mp4|webm|mov)$ {
    expires 1M;
    add_header Cache-Control "public";
}

# Compression
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

# WebP serving
location ~* \.(jpe?g|png)$ {
    add_header Vary Accept;
    try_files $uri$webp_suffix $uri =404;
}

map $http_accept $webp_suffix {
    default "";
    "~*webp" ".webp";
}
```

## 📊 Performance Monitoring Setup

### 1. Google PageSpeed Insights Integration
```html
<!-- Add to <head> -->
<link rel="preconnect" href="https://www.googletagmanager.com">
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### 2. Real User Monitoring (RUM)
```javascript
// Add to your existing performance monitoring
const sendToAnalytics = (data) => {
    if ('sendBeacon' in navigator) {
        navigator.sendBeacon('/analytics', JSON.stringify(data));
    } else {
        fetch('/analytics', {
            method: 'POST',
            body: JSON.stringify(data),
            keepalive: true
        });
    }
};
```

## 🎯 Core Web Vitals Optimization

### LCP (Largest Contentful Paint) Targets: < 2.5s
- ✅ Preload hero images: `<link rel="preload" as="image" href="hero-image.webp">`
- ✅ Optimize hero video compression
- ✅ Use responsive images with proper sizing
- ✅ Implement lazy loading for below-fold content

### FID (First Input Delay) Target: < 100ms
- ✅ Minimize JavaScript execution during load
- ✅ Use `requestIdleCallback` for non-critical scripts
- ✅ Code split large JavaScript bundles
- ✅ Defer non-critical JavaScript

### CLS (Cumulative Layout Shift) Target: < 0.1
- ✅ Set explicit width/height on images and videos
- ✅ Reserve space for dynamic content
- ✅ Avoid inserting content above existing content
- ✅ Use `font-display: swap` for web fonts

## 🖼️ Image Optimization Best Practices

### Format Selection Priority
1. **AVIF** (best compression, 70% browser support)
2. **WebP** (good compression, 95% browser support) 
3. **JPEG/PNG** (universal fallback)

### Responsive Image Implementation
```html
<picture>
    <source 
        srcset="image-small.avif 480w, image-medium.avif 768w, image-large.avif 1200w"
        type="image/avif">
    <source 
        srcset="image-small.webp 480w, image-medium.webp 768w, image-large.webp 1200w"
        type="image/webp">
    <img 
        src="image-medium.jpg"
        srcset="image-small.jpg 480w, image-medium.jpg 768w, image-large.jpg 1200w"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        alt="Descriptive alt text"
        width="400" 
        height="300"
        loading="lazy">
</picture>
```

## 🎥 Video Optimization Best Practices

### Format Priority
1. **WebM** (VP9) - Best compression for modern browsers
2. **MP4** (H.264) - Universal compatibility
3. **MP4** (H.265/HEVC) - Future-proofing

### Responsive Video Implementation
```html
<video autoplay muted loop playsinline preload="none" data-lazy>
    <source 
        data-src="video-small.webm" 
        type="video/webm" 
        media="(max-width: 768px)">
    <source 
        data-src="video-medium.webm" 
        type="video/webm" 
        media="(max-width: 1200px)">
    <source 
        data-src="video-large.webm" 
        type="video/webm">
    <source 
        data-src="video-small.mp4" 
        type="video/mp4" 
        media="(max-width: 768px)">
    <source 
        data-src="video-medium.mp4" 
        type="video/mp4" 
        media="(max-width: 1200px)">
    <source 
        data-src="video-large.mp4" 
        type="video/mp4">
</video>
```

## 📈 Performance Testing Checklist

### Tools to Use
- [ ] Google PageSpeed Insights
- [ ] WebPageTest.org
- [ ] GTmetrix
- [ ] Chrome DevTools Lighthouse
- [ ] Google Search Console Core Web Vitals

### Metrics to Track
- [ ] **LCP** < 2.5s (Good), < 4.0s (Needs Improvement)
- [ ] **FID** < 100ms (Good), < 300ms (Needs Improvement)  
- [ ] **CLS** < 0.1 (Good), < 0.25 (Needs Improvement)
- [ ] **TTFB** < 800ms (Good), < 1800ms (Needs Improvement)
- [ ] **Speed Index** < 3.4s
- [ ] **Total Blocking Time** < 200ms

### Testing Conditions
- [ ] Test on 3G connection
- [ ] Test on mobile devices
- [ ] Test with JavaScript disabled
- [ ] Test with images disabled
- [ ] Test from different geographic locations

## 🚀 Implementation Priority

### Phase 1: Quick Wins (Week 1)
1. ✅ Enable Cloudflare CDN
2. ✅ Add image lazy loading
3. ✅ Add width/height attributes to images
4. ✅ Compress existing images

### Phase 2: Advanced Optimization (Week 2)
1. ✅ Generate WebP/AVIF formats
2. ✅ Implement responsive images
3. ✅ Optimize video compression
4. ✅ Add performance monitoring

### Phase 3: Fine-tuning (Week 3)
1. 🔄 Monitor Core Web Vitals
2. 🔄 A/B test loading strategies
3. 🔄 Optimize based on real user data
4. 🔄 Implement advanced caching strategies

## 📱 Mobile Optimization

### Key Considerations
- Prioritize mobile-first loading
- Use smaller image/video sizes for mobile
- Implement touch-friendly interactions
- Test on actual devices, not just browser dev tools

### Mobile-Specific Optimizations
```css
/* Optimize for mobile viewports */
@media (max-width: 768px) {
    .hero-video {
        display: none; /* Hide videos on mobile */
    }
    
    .gallery-item img {
        max-width: 100%;
        height: auto;
    }
}
```

This guide provides a comprehensive roadmap for optimizing your website's performance. Focus on implementing Phase 1 items first for immediate improvements, then gradually roll out the advanced optimizations.
