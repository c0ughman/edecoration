/**
 * Video Performance Monitor
 * Tracks video loading performance and user engagement
 */

class VideoPerformanceMonitor {
    constructor() {
        this.metrics = {
            videos: [],
            totalLoadTime: 0,
            averageLoadTime: 0,
            totalSize: 0,
            userEngagement: {}
        };
        
        this.init();
    }
    
    init() {
        this.setupPerformanceObserver();
        this.setupVideoTracking();
        this.setupUserEngagementTracking();
    }
    
    setupPerformanceObserver() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    if (entry.entryType === 'resource' && this.isVideoResource(entry.name)) {
                        this.trackVideoLoad(entry);
                    }
                });
            });
            
            observer.observe({ entryTypes: ['resource'] });
        }
    }
    
    setupVideoTracking() {
        document.addEventListener('DOMContentLoaded', () => {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                this.trackVideoElement(video);
            });
        });
    }
    
    setupUserEngagementTracking() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('video')) {
                this.trackUserEngagement(e.target.closest('video'), 'click');
            }
        });
        
        document.addEventListener('scroll', () => {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                if (this.isElementInViewport(video)) {
                    this.trackUserEngagement(video, 'view');
                }
            });
        });
    }
    
    isVideoResource(url) {
        return /\.(mp4|webm|mov|avi|mkv)$/i.test(url);
    }
    
    trackVideoLoad(entry) {
        const videoInfo = {
            url: entry.name,
            loadTime: entry.duration,
            size: entry.transferSize || 0,
            timestamp: Date.now()
        };
        
        this.metrics.videos.push(videoInfo);
        this.metrics.totalLoadTime += entry.duration;
        this.metrics.totalSize += videoInfo.size;
        this.metrics.averageLoadTime = this.metrics.totalLoadTime / this.metrics.videos.length;
        
        this.logPerformance(videoInfo);
    }
    
    trackVideoElement(video) {
        const startTime = performance.now();
        
        video.addEventListener('loadeddata', () => {
            const loadTime = performance.now() - startTime;
            this.trackVideoLoad({
                name: video.src || video.currentSrc,
                duration: loadTime,
                transferSize: 0
            });
        });
        
        video.addEventListener('play', () => {
            this.trackUserEngagement(video, 'play');
        });
        
        video.addEventListener('pause', () => {
            this.trackUserEngagement(video, 'pause');
        });
    }
    
    trackUserEngagement(video, action) {
        const videoId = video.src || video.currentSrc;
        if (!this.metrics.userEngagement[videoId]) {
            this.metrics.userEngagement[videoId] = {};
        }
        
        if (!this.metrics.userEngagement[videoId][action]) {
            this.metrics.userEngagement[videoId][action] = 0;
        }
        
        this.metrics.userEngagement[videoId][action]++;
    }
    
    isElementInViewport(el) {
        const rect = el.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }
    
    logPerformance(videoInfo) {
        console.log(`🎥 Video loaded: ${videoInfo.url}`);
        console.log(`   Load time: ${videoInfo.loadTime.toFixed(2)}ms`);
        console.log(`   Size: ${(videoInfo.size / 1024 / 1024).toFixed(2)}MB`);
    }
    
    getMetrics() {
        return {
            ...this.metrics,
            totalVideos: this.metrics.videos.length,
            averageSize: this.metrics.totalSize / this.metrics.videos.length
        };
    }
    
    generateReport() {
        const metrics = this.getMetrics();
        
        console.log('📊 Video Performance Report');
        console.log('========================');
        console.log(`Total videos: ${metrics.totalVideos}`);
        console.log(`Average load time: ${metrics.averageLoadTime.toFixed(2)}ms`);
        console.log(`Total size: ${(metrics.totalSize / 1024 / 1024).toFixed(2)}MB`);
        console.log(`Average size: ${(metrics.averageSize / 1024 / 1024).toFixed(2)}MB`);
        
        return metrics;
    }
}

// Initialize performance monitor
const videoPerformanceMonitor = new VideoPerformanceMonitor();

// Export for global access
window.videoPerformanceMonitor = videoPerformanceMonitor; 