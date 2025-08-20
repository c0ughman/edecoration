/**
 * Advanced Image Optimization System
 * Handles modern formats, responsive loading, and performance monitoring
 */

class ImageOptimizer {
    constructor() {
        this.supportedFormats = this.detectFormatSupport();
        this.loadingState = new Map();
        this.performanceMetrics = [];
        this.init();
    }

    init() {
        this.setupLazyLoading();
        this.setupProgressiveLoading();
        this.setupPerformanceTracking();
    }

    detectFormatSupport() {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        
        return {
            avif: canvas.toDataURL('image/avif').indexOf('data:image/avif') === 0,
            webp: canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0,
            jp2: canvas.toDataURL('image/jp2').indexOf('data:image/jp2') === 0
        };
    }

    setupLazyLoading() {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadImage(entry.target);
                    imageObserver.unobserve(entry.target);
                }
            });
        }, {
            rootMargin: '50px',
            threshold: 0.01
        });

        // Observe all images with data-src
        document.querySelectorAll('img[data-src]').forEach(img => {
            this.prepareImage(img);
            imageObserver.observe(img);
        });

        // Auto-convert existing images to lazy loading
        document.querySelectorAll('img:not([data-src])').forEach(img => {
            if (img.src && !img.classList.contains('no-lazy')) {
                this.convertToLazy(img);
                imageObserver.observe(img);
            }
        });
    }

    prepareImage(img) {
        // Add loading placeholder
        img.classList.add('lazy-loading');
        
        // Don't add background to logos or images that should stay transparent
        const isLogo = img.closest('.logo-item') || 
                      img.classList.contains('logo-image') || 
                      img.classList.contains('footer-logo-img') ||
                      img.classList.contains('no-lazy');
        
        // Create placeholder only for gallery/content images, not logos
        if (!isLogo && !img.style.backgroundColor) {
            img.style.backgroundColor = '#f0f0f0';
            img.style.backgroundImage = `
                linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.3) 50%, transparent 60%),
                linear-gradient(90deg, #f0f0f0 0%, #e0e0e0 50%, #f0f0f0 100%)
            `;
            img.style.backgroundSize = '200% 100%, 100% 100%';
            img.style.animation = 'shimmer 1.5s infinite';
        }
    }

    convertToLazy(img) {
        if (img.src) {
            img.setAttribute('data-src', img.src);
            img.removeAttribute('src');
            this.prepareImage(img);
        }
    }

    async loadImage(img) {
        const startTime = performance.now();
        const originalSrc = img.dataset.src;
        
        if (!originalSrc) return;

        // Generate optimized sources
        const sources = this.generateOptimizedSources(originalSrc, img);
        
        try {
            // Try to load best supported format
            const bestSource = this.selectBestSource(sources);
            
            await this.loadImageWithFallback(img, bestSource, sources);
            
            // Performance tracking
            const loadTime = performance.now() - startTime;
            this.trackImagePerformance(originalSrc, loadTime, bestSource);
            
            // Remove loading state
            img.classList.remove('lazy-loading');
            img.classList.add('lazy-loaded');
            
        } catch (error) {
            console.error('Image loading failed:', error);
            // Fallback to original
            img.src = originalSrc;
            img.classList.remove('lazy-loading');
            img.classList.add('lazy-error');
        }
    }

    generateOptimizedSources(originalSrc, img) {
        const basePath = originalSrc.replace(/\.[^/.]+$/, '');
        const extension = originalSrc.split('.').pop().toLowerCase();
        
        // Get responsive sizes
        const sizes = this.getResponsiveSizes(img);
        
        const sources = [];
        
        // Generate AVIF sources (best compression)
        if (this.supportedFormats.avif) {
            sizes.forEach(size => {
                sources.push({
                    src: `${basePath}-${size.name}.avif`,
                    format: 'avif',
                    media: size.media,
                    fallback: false
                });
            });
        }
        
        // Generate WebP sources (good compression)
        if (this.supportedFormats.webp) {
            sizes.forEach(size => {
                sources.push({
                    src: `${basePath}-${size.name}.webp`,
                    format: 'webp',
                    media: size.media,
                    fallback: false
                });
            });
        }
        
        // Original format fallbacks
        sizes.forEach(size => {
            sources.push({
                src: size.src || originalSrc,
                format: extension,
                media: size.media,
                fallback: true
            });
        });
        
        return sources;
    }

    getResponsiveSizes(img) {
        // Define responsive breakpoints
        const breakpoints = [
            { name: 'small', width: 480, media: '(max-width: 768px)' },
            { name: 'medium', width: 768, media: '(max-width: 1200px)' },
            { name: 'large', width: 1200, media: '(min-width: 1201px)' }
        ];
        
        // Get image's intended display size
        const computedStyle = window.getComputedStyle(img);
        const maxWidth = parseInt(computedStyle.maxWidth) || parseInt(computedStyle.width) || 1200;
        
        return breakpoints.filter(bp => bp.width <= maxWidth * 1.5); // 1.5x for retina
    }

    selectBestSource(sources) {
        // Filter by browser support
        const supportedSources = sources.filter(source => {
            if (source.format === 'avif') return this.supportedFormats.avif;
            if (source.format === 'webp') return this.supportedFormats.webp;
            return true; // Always support fallback formats
        });
        
        // Select based on media query match
        const matchedSource = supportedSources.find(source => {
            if (!source.media) return true;
            return window.matchMedia(source.media).matches;
        });
        
        return matchedSource || supportedSources[0];
    }

    async loadImageWithFallback(img, primarySource, allSources) {
        try {
            await this.loadSingleImage(img, primarySource.src);
        } catch (error) {
            // Try fallback sources
            const fallbackSources = allSources.filter(s => s.fallback && s !== primarySource);
            
            for (const fallback of fallbackSources) {
                try {
                    await this.loadSingleImage(img, fallback.src);
                    return;
                } catch (e) {
                    continue;
                }
            }
            throw new Error('All image sources failed to load');
        }
    }

    loadSingleImage(img, src) {
        return new Promise((resolve, reject) => {
            const testImg = new Image();
            testImg.onload = () => {
                img.src = src;
                resolve();
            };
            testImg.onerror = reject;
            testImg.src = src;
        });
    }

    setupProgressiveLoading() {
        // Add CSS for loading states
        if (!document.getElementById('image-optimizer-styles')) {
            const style = document.createElement('style');
            style.id = 'image-optimizer-styles';
            style.textContent = `
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                
                .lazy-loading {
                    opacity: 0.7;
                    transition: opacity 0.3s ease;
                }
                
                .lazy-loaded {
                    opacity: 1;
                    background: none !important;
                    animation: none !important;
                }
                
                .lazy-error {
                    opacity: 0.5;
                    background: #ffebee !important;
                }
                
                /* Fade-in animation */
                .lazy-loaded {
                    animation: fadeIn 0.5s ease-in-out;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                /* Logo-specific styles */
                .logo-item img,
                .footer-logo-img {
                    background: transparent !important;
                }
                
                /* Client logos should have white background */
                .client-logos .logo-item {
                    background: white;
                    border-radius: 8px;
                    padding: 10px;
                }
                
                /* Footer logo should stay transparent */
                .footer-logo-img {
                    background: transparent !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    setupPerformanceTracking() {
        // Track Core Web Vitals impact
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    if (entry.entryType === 'resource' && this.isImageResource(entry.name)) {
                        this.trackImageLoad(entry);
                    }
                });
            });
            
            observer.observe({ entryTypes: ['resource'] });
        }
    }

    isImageResource(url) {
        return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/i.test(url);
    }

    trackImageLoad(entry) {
        this.performanceMetrics.push({
            url: entry.name,
            loadTime: entry.duration,
            size: entry.transferSize || 0,
            timestamp: Date.now()
        });
    }

    trackImagePerformance(url, loadTime, source) {
        console.log(`🖼️ Image loaded: ${url}`);
        console.log(`   Format: ${source.format}`);
        console.log(`   Load time: ${loadTime.toFixed(2)}ms`);
    }

    getPerformanceReport() {
        const totalImages = this.performanceMetrics.length;
        const totalLoadTime = this.performanceMetrics.reduce((sum, m) => sum + m.loadTime, 0);
        const totalSize = this.performanceMetrics.reduce((sum, m) => sum + m.size, 0);
        
        return {
            totalImages,
            averageLoadTime: totalLoadTime / totalImages,
            totalSize: totalSize,
            averageSize: totalSize / totalImages,
            supportedFormats: this.supportedFormats
        };
    }
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    window.imageOptimizer = new ImageOptimizer();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageOptimizer;
}
