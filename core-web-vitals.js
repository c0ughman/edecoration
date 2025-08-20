/**
 * Core Web Vitals Monitor
 * Tracks LCP, FID, CLS, and other performance metrics
 */

class CoreWebVitalsMonitor {
    constructor() {
        this.metrics = {};
        this.thresholds = {
            LCP: { good: 2500, needsImprovement: 4000 },
            FID: { good: 100, needsImprovement: 300 },
            CLS: { good: 0.1, needsImprovement: 0.25 },
            TTFB: { good: 800, needsImprovement: 1800 }
        };
        
        this.init();
    }
    
    init() {
        this.measureLCP();
        this.measureFID();
        this.measureCLS();
        this.measureTTFB();
        this.setupResourceTimings();
        this.generateReport();
    }
    
    measureLCP() {
        try {
            const observer = new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                const lastEntry = entries[entries.length - 1];
                
                this.metrics.LCP = {
                    value: lastEntry.startTime,
                    element: lastEntry.element,
                    rating: this.getRating('LCP', lastEntry.startTime)
                };
                
                console.log(`🎯 LCP: ${lastEntry.startTime.toFixed(2)}ms (${this.metrics.LCP.rating})`);
            });
            
            observer.observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (e) {
            console.warn('LCP measurement not supported');
        }
    }
    
    measureFID() {
        try {
            const observer = new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                entries.forEach((entry) => {
                    this.metrics.FID = {
                        value: entry.processingStart - entry.startTime,
                        rating: this.getRating('FID', entry.processingStart - entry.startTime)
                    };
                    
                    console.log(`👆 FID: ${this.metrics.FID.value.toFixed(2)}ms (${this.metrics.FID.rating})`);
                });
            });
            
            observer.observe({ entryTypes: ['first-input'] });
        } catch (e) {
            console.warn('FID measurement not supported');
        }
    }
    
    measureCLS() {
        try {
            let clsValue = 0;
            const observer = new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                entries.forEach((entry) => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                    }
                });
                
                this.metrics.CLS = {
                    value: clsValue,
                    rating: this.getRating('CLS', clsValue)
                };
                
                console.log(`📐 CLS: ${clsValue.toFixed(4)} (${this.metrics.CLS.rating})`);
            });
            
            observer.observe({ entryTypes: ['layout-shift'] });
        } catch (e) {
            console.warn('CLS measurement not supported');
        }
    }
    
    measureTTFB() {
        try {
            const observer = new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                entries.forEach((entry) => {
                    if (entry.entryType === 'navigation') {
                        const ttfb = entry.responseStart - entry.requestStart;
                        
                        this.metrics.TTFB = {
                            value: ttfb,
                            rating: this.getRating('TTFB', ttfb)
                        };
                        
                        console.log(`⚡ TTFB: ${ttfb.toFixed(2)}ms (${this.metrics.TTFB.rating})`);
                    }
                });
            });
            
            observer.observe({ entryTypes: ['navigation'] });
        } catch (e) {
            // Fallback for older browsers
            window.addEventListener('load', () => {
                const navigation = performance.getEntriesByType('navigation')[0];
                if (navigation) {
                    const ttfb = navigation.responseStart - navigation.requestStart;
                    
                    this.metrics.TTFB = {
                        value: ttfb,
                        rating: this.getRating('TTFB', ttfb)
                    };
                    
                    console.log(`⚡ TTFB: ${ttfb.toFixed(2)}ms (${this.metrics.TTFB.rating})`);
                }
            });
        }
    }
    
    setupResourceTimings() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => {
                    if (this.isImageResource(entry.name)) {
                        this.trackImagePerformance(entry);
                    } else if (this.isVideoResource(entry.name)) {
                        this.trackVideoPerformance(entry);
                    }
                });
            });
            
            observer.observe({ entryTypes: ['resource'] });
        }
    }
    
    isImageResource(url) {
        return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/i.test(url);
    }
    
    isVideoResource(url) {
        return /\.(mp4|webm|mov|avi|mkv)$/i.test(url);
    }
    
    trackImagePerformance(entry) {
        if (!this.metrics.images) this.metrics.images = [];
        
        this.metrics.images.push({
            url: entry.name,
            size: entry.transferSize || 0,
            loadTime: entry.duration,
            timestamp: Date.now()
        });
    }
    
    trackVideoPerformance(entry) {
        if (!this.metrics.videos) this.metrics.videos = [];
        
        this.metrics.videos.push({
            url: entry.name,
            size: entry.transferSize || 0,
            loadTime: entry.duration,
            timestamp: Date.now()
        });
    }
    
    getRating(metric, value) {
        const threshold = this.thresholds[metric];
        if (!threshold) return 'unknown';
        
        if (value <= threshold.good) return 'good';
        if (value <= threshold.needsImprovement) return 'needs-improvement';
        return 'poor';
    }
    
    generateReport() {
        // Wait for page load to generate complete report
        window.addEventListener('load', () => {
            setTimeout(() => {
                this.printReport();
                this.sendAnalytics();
            }, 2000);
        });
    }
    
    printReport() {
        console.log('\n📊 === CORE WEB VITALS REPORT ===');
        console.log('================================');
        
        Object.keys(this.metrics).forEach(metric => {
            if (typeof this.metrics[metric] === 'object' && this.metrics[metric].value !== undefined) {
                console.log(`${metric}: ${this.metrics[metric].value.toFixed(2)} (${this.metrics[metric].rating})`);
            }
        });
        
        if (this.metrics.images) {
            const totalImageSize = this.metrics.images.reduce((sum, img) => sum + img.size, 0);
            const avgImageLoad = this.metrics.images.reduce((sum, img) => sum + img.loadTime, 0) / this.metrics.images.length;
            
            console.log(`\n🖼️ Images: ${this.metrics.images.length} total`);
            console.log(`   Total size: ${(totalImageSize / 1024 / 1024).toFixed(2)}MB`);
            console.log(`   Average load: ${avgImageLoad.toFixed(2)}ms`);
        }
        
        if (this.metrics.videos) {
            const totalVideoSize = this.metrics.videos.reduce((sum, vid) => sum + vid.size, 0);
            const avgVideoLoad = this.metrics.videos.reduce((sum, vid) => sum + vid.loadTime, 0) / this.metrics.videos.length;
            
            console.log(`\n🎥 Videos: ${this.metrics.videos.length} total`);
            console.log(`   Total size: ${(totalVideoSize / 1024 / 1024).toFixed(2)}MB`);
            console.log(`   Average load: ${avgVideoLoad.toFixed(2)}ms`);
        }
        
        console.log('\n💡 Optimization Suggestions:');
        this.generateSuggestions();
    }
    
    generateSuggestions() {
        const suggestions = [];
        
        if (this.metrics.LCP && this.metrics.LCP.rating !== 'good') {
            suggestions.push('• Optimize LCP element loading (consider preloading critical images)');
        }
        
        if (this.metrics.FID && this.metrics.FID.rating !== 'good') {
            suggestions.push('• Reduce JavaScript execution time during initial load');
        }
        
        if (this.metrics.CLS && this.metrics.CLS.rating !== 'good') {
            suggestions.push('• Add size attributes to images and videos to prevent layout shifts');
        }
        
        if (this.metrics.TTFB && this.metrics.TTFB.rating !== 'good') {
            suggestions.push('• Optimize server response time or consider CDN');
        }
        
        if (this.metrics.images && this.metrics.images.length > 20) {
            suggestions.push('• Consider implementing more aggressive image lazy loading');
        }
        
        if (this.metrics.videos && this.metrics.videos.some(v => v.size > 10 * 1024 * 1024)) {
            suggestions.push('• Some videos are >10MB, consider additional compression');
        }
        
        suggestions.forEach(suggestion => console.log(suggestion));
        
        if (suggestions.length === 0) {
            console.log('✅ All metrics look good! Great job!');
        }
    }
    
    sendAnalytics() {
        // Prepare data for analytics
        const analyticsData = {
            lcp: this.metrics.LCP?.value,
            fid: this.metrics.FID?.value,
            cls: this.metrics.CLS?.value,
            ttfb: this.metrics.TTFB?.value,
            imageCount: this.metrics.images?.length || 0,
            videoCount: this.metrics.videos?.length || 0,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            connection: navigator.connection?.effectiveType || 'unknown'
        };
        
        // You can send this to your analytics service
        console.log('📈 Analytics data ready:', analyticsData);
    }
    
    getMetrics() {
        return this.metrics;
    }
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    window.coreWebVitalsMonitor = new CoreWebVitalsMonitor();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoreWebVitalsMonitor;
}
