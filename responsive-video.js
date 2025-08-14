/**
 * Responsive Video Component
 * Handles responsive video loading with multiple formats and sizes
 */

class ResponsiveVideo {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.options = {
            autoplay: true,
            muted: true,
            loop: true,
            playsinline: true,
            preload: 'none',
            lazy: true,
            ...options
        };
        
        this.init();
    }
    
    init() {
        if (!this.container) return;
        
        this.createVideoElement();
        this.setupResponsiveSources();
        this.setupLazyLoading();
    }
    
    createVideoElement() {
        this.video = document.createElement('video');
        this.video.autoplay = this.options.autoplay;
        this.video.muted = this.options.muted;
        this.video.loop = this.options.loop;
        this.video.playsinline = this.options.playsinline;
        this.video.preload = this.options.preload;
        
        if (this.options.lazy) {
            this.video.setAttribute('data-lazy', 'true');
        }
        
        // Add CSS classes
        this.video.className = 'responsive-video';
        
        // Clear container and append video
        this.container.innerHTML = '';
        this.container.appendChild(this.video);
    }
    
    setupResponsiveSources() {
        const sources = this.options.sources || [];
        
        sources.forEach(source => {
            const sourceElement = document.createElement('source');
            sourceElement.type = source.type || 'video/mp4';
            
            if (this.options.lazy) {
                sourceElement.setAttribute('data-src', source.src);
            } else {
                sourceElement.src = source.src;
            }
            
            if (source.media) {
                sourceElement.media = source.media;
            }
            
            this.video.appendChild(sourceElement);
        });
    }
    
    setupLazyLoading() {
        if (!this.options.lazy) return;
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadVideo();
                    observer.unobserve(entry.target);
                }
            });
        }, {
            rootMargin: '100px'
        });
        
        observer.observe(this.video);
    }
    
    loadVideo() {
        const sources = this.video.querySelectorAll('source[data-src]');
        sources.forEach(source => {
            if (!source.src) {
                source.src = source.dataset.src;
            }
        });
        
        this.video.load();
    }
    
    play() {
        if (this.video) {
            this.video.play().catch(e => console.log('Video play failed:', e));
        }
    }
    
    pause() {
        if (this.video) {
            this.video.pause();
        }
    }
    
    destroy() {
        if (this.video) {
            this.video.pause();
            this.video.src = '';
            this.video.load();
            this.container.innerHTML = '';
        }
    }
}

// Auto-initialize responsive videos
document.addEventListener('DOMContentLoaded', function() {
    // Initialize videos with data-responsive-video attribute
    document.querySelectorAll('[data-responsive-video]').forEach(container => {
        const options = JSON.parse(container.dataset.responsiveVideo || '{}');
        new ResponsiveVideo(container, options);
    });
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResponsiveVideo;
} 