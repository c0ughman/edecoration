/* ========================================
   EDECORATION S.A. - RESPONSIVE JAVASCRIPT
   Mobile-First Interactive Features
   ======================================== */

document.addEventListener('DOMContentLoaded', function() {
    
    // ========================================
    // MOBILE NAVIGATION
    // ========================================
    
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileNav = document.querySelector('.mobile-nav');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav a');
    const body = document.body;

    if (mobileMenuToggle && mobileNav) {
        // Toggle mobile menu
        mobileMenuToggle.addEventListener('click', function() {
            const isActive = mobileMenuToggle.classList.contains('active');
            
            if (isActive) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });

        // Close mobile menu when clicking on links
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', function() {
                closeMobileMenu();
            });
        });

        // Close mobile menu when clicking outside
        mobileNav.addEventListener('click', function(e) {
            if (e.target === mobileNav) {
                closeMobileMenu();
            }
        });

        // Close mobile menu on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && mobileNav.classList.contains('active')) {
                closeMobileMenu();
            }
        });
    }

    function openMobileMenu() {
        mobileMenuToggle.classList.add('active');
        mobileNav.classList.add('active');
        body.style.overflow = 'hidden';
    }

    function closeMobileMenu() {
        mobileMenuToggle.classList.remove('active');
        mobileNav.classList.remove('active');
        body.style.overflow = '';
    }

    // ========================================
    // RESPONSIVE HEADER BEHAVIOR
    // ========================================
    
    const heroHeader = document.querySelector('.hero-header');
    let lastScrollY = window.scrollY;
    let ticking = false;

    function updateHeader() {
        const scrollY = window.scrollY;
        
        if (scrollY > 100) {
            heroHeader.style.background = 'transparent';
            heroHeader.style.backdropFilter = 'blur(25px)';
        } else {
            heroHeader.style.background = 'transparent';
            heroHeader.style.backdropFilter = 'blur(20px)';
        }
        
        lastScrollY = scrollY;
        ticking = false;
    }

    function requestHeaderUpdate() {
        if (!ticking) {
            requestAnimationFrame(updateHeader);
            ticking = true;
        }
    }

    window.addEventListener('scroll', requestHeaderUpdate);

    // ========================================
    // RESPONSIVE GALLERY WITH TOUCH SUPPORT
    // ========================================
    
    const galleryItems = document.querySelectorAll('.gallery-item');

    // Function to get product page URL based on item class
    function getProductPageUrl(item) {
        if (item.classList.contains('sala')) {
            return 'productos/cortinas-para-sala.html';
        } else if (item.classList.contains('oficina')) {
            return 'productos/cortinas-para-oficina.html';
        } else if (item.classList.contains('cuartos')) {
            return 'productos/cortinas-para-cuartos.html';
        }
        return '#';
    }

    // Check if device supports touch
    function isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    galleryItems.forEach(item => {
        // Add click functionality for all devices
        item.addEventListener('click', function() {
            const url = getProductPageUrl(this);
            if (url !== '#') {
                window.location.href = url;
            }
        });

        // Add visual feedback
        item.style.cursor = 'pointer';

        // Touch feedback for mobile devices
        if (isTouchDevice()) {
            item.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.98)';
            });

            item.addEventListener('touchend', function() {
                this.style.transform = 'scale(1)';
            });
        }
    });


    // ========================================
    // SMOOTH SCROLLING FOR NAVIGATION LINKS
    // ========================================
    
    const navLinks = document.querySelectorAll('a[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                const headerHeight = heroHeader.offsetHeight;
                const targetPosition = targetSection.offsetTop - headerHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
                
                // Close mobile menu if open
                if (mobileNav.classList.contains('active')) {
                    closeMobileMenu();
                }
            }
        });
    });

    // ========================================
    // RESPONSIVE IMAGE LAZY LOADING
    // ========================================
    
    const images = document.querySelectorAll('img[data-src]');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                imageObserver.unobserve(img);
            }
        });
    });

    images.forEach(img => imageObserver.observe(img));

    // ========================================
    // RESPONSIVE ANIMATIONS ON SCROLL
    // ========================================
    
    const animatedElements = document.querySelectorAll('.value-card, .testimonial, .gallery-item, .bento-item');
    
    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    animatedElements.forEach(element => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(30px)';
        element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        animationObserver.observe(element);
    });

    // ========================================
    // VIDEO OPTIMIZATION FOR MOBILE
    // ========================================
    
    const videos = document.querySelectorAll('video');
    
    videos.forEach(video => {
        // Pause videos when not in viewport to save battery
        const videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    video.play().catch(e => console.log('Video play failed:', e));
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.5 });
        
        videoObserver.observe(video);
        
        // Reduce video quality on slow connections
        if ('connection' in navigator) {
            const connection = navigator.connection;
            if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
                video.style.display = 'none';
                // Show fallback image instead
                const fallbackImg = video.nextElementSibling;
                if (fallbackImg && fallbackImg.tagName === 'IMG') {
                    fallbackImg.style.display = 'block';
                }
            }
        }
    });

    // ========================================
    // RESPONSIVE TOUCH GESTURES
    // ========================================
    
    if (isTouchDevice()) {
        let touchStartX = 0;
        let touchStartY = 0;
        
        document.addEventListener('touchstart', function(e) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });
        
        document.addEventListener('touchmove', function(e) {
            // Prevent scroll bouncing on iOS
            if (e.target.closest('.mobile-nav')) {
                e.preventDefault();
            }
        });
        
        // Swipe to close mobile menu
        mobileNav.addEventListener('touchend', function(e) {
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            
            // Swipe right to close
            if (deltaX > 100 && Math.abs(deltaY) < 100) {
                closeMobileMenu();
            }
        });
    }

    // ========================================
    // PERFORMANCE OPTIMIZATIONS
    // ========================================
    
    // Preload critical images
    const criticalImages = [
        'media/logo.png',
        'landing-media/sala-con-pintura.jpeg'
    ];
    
    criticalImages.forEach(src => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = src;
        document.head.appendChild(link);
    });

    // Optimize scroll performance
    let scrollTimeout;
    window.addEventListener('scroll', function() {
        document.body.classList.add('scrolling');
        
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(function() {
            document.body.classList.remove('scrolling');
        }, 100);
    });

    // ========================================
    // RESPONSIVE UTILITIES
    // ========================================
    
    // Update CSS custom properties based on viewport (optimized to prevent forced reflows)
    let viewportHeight = window.innerHeight;
    
    function updateViewportProperties() {
        const vh = viewportHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    function cacheViewportHeight() {
        viewportHeight = window.innerHeight;
        updateViewportProperties();
    }
    
    // Use cached height and throttle updates
    let resizeTimeout;
    function throttledResize() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(cacheViewportHeight, 100);
    }
    
    cacheViewportHeight();
    window.addEventListener('resize', throttledResize);
    
    // Detect orientation changes
    window.addEventListener('orientationchange', function() {
        setTimeout(cacheViewportHeight, 100);
        
        // Close mobile menu on orientation change
        if (mobileNav && mobileNav.classList.contains('active')) {
            closeMobileMenu();
        }
    });

    // ========================================
    // ACCESSIBILITY ENHANCEMENTS
    // ========================================
    
    // Skip to main content
    const skipLink = document.createElement('a');
    skipLink.href = '#galeria';
    skipLink.textContent = 'Skip to main content';
    skipLink.className = 'skip-link';
    skipLink.style.cssText = `
        position: absolute;
        top: -40px;
        left: 6px;
        background: var(--wine-red);
        color: white;
        padding: 8px;
        text-decoration: none;
        border-radius: 4px;
        z-index: 10000;
        transition: top 0.3s;
    `;
    
    skipLink.addEventListener('focus', function() {
        this.style.top = '6px';
    });
    
    skipLink.addEventListener('blur', function() {
        this.style.top = '-40px';
    });
    
    document.body.insertBefore(skipLink, document.body.firstChild);
    
    // Announce page changes to screen readers
    const announcer = document.createElement('div');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    announcer.style.cssText = `
        position: absolute;
        left: -10000px;
        width: 1px;
        height: 1px;
        overflow: hidden;
    `;
    document.body.appendChild(announcer);
    
    // Announce when mobile menu opens/closes
    mobileMenuToggle.addEventListener('click', function() {
        const isActive = this.classList.contains('active');
        announcer.textContent = isActive ? 'Menu closed' : 'Menu opened';
    });

    console.log('Edecoration S.A. - Responsive site loaded successfully! 🎉');
});