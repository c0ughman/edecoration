/* ========================================
   RESPONSIVE REDIRECT SCRIPT
   Redirects between desktop and mobile versions
   ======================================== */

(function() {
    const BREAKPOINT = 1114;
    
    function getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('responsive.html')) {
            return 'responsive';
        } else if (path.includes('index.html') || path.endsWith('/')) {
            return 'desktop';
        }
        return 'unknown';
    }
    
    function getScreenWidth() {
        return window.innerWidth;
    }
    
    function shouldShowResponsive() {
        return getScreenWidth() < BREAKPOINT;
    }
    
    function redirectToAppropriateVersion() {
        const currentPage = getCurrentPage();
        const shouldUseResponsive = shouldShowResponsive();
        
        // Only redirect if we're on the wrong version
        if (shouldUseResponsive && currentPage === 'desktop') {
            // Redirect to responsive version
            const currentUrl = new URL(window.location);
            if (currentUrl.pathname.endsWith('/')) {
                window.location.href = currentUrl.origin + currentUrl.pathname + 'responsive.html' + currentUrl.search + currentUrl.hash;
            } else {
                window.location.href = currentUrl.href.replace('index.html', 'responsive.html');
            }
        } else if (!shouldUseResponsive && currentPage === 'responsive') {
            // Redirect to desktop version
            const currentUrl = new URL(window.location);
            window.location.href = currentUrl.href.replace('responsive.html', 'index.html');
        }
    }
    
    // Check on initial load
    document.addEventListener('DOMContentLoaded', function() {
        redirectToAppropriateVersion();
    });
    
    // Check on window resize with debouncing
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            redirectToAppropriateVersion();
        }, 250); // 250ms debounce
    });
    
    // Check on orientation change (mobile devices)
    window.addEventListener('orientationchange', function() {
        setTimeout(function() {
            redirectToAppropriateVersion();
        }, 100);
    });
    
    console.log('Responsive redirect script loaded. Breakpoint:', BREAKPOINT + 'px');
})();