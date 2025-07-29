// Smooth scrolling for navigation links
document.addEventListener('DOMContentLoaded', function() {
    // Scroll-triggered fade-out for hero elements
    const heroSubtitle = document.querySelector('.hero-subtitle');
    const heroCta = document.querySelector('.hero-cta');
    const heroContent = document.querySelector('.hero-content');
    let fadeOutTriggered = false;
    let unstickyTriggered = false;

    function handleScrollFadeOut() {
        const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        
        // Hide hero content completely at 50% scroll (much later)
        if (scrollPercent > 20) {
            if (heroContent) heroContent.classList.add('hidden');
        } else {
            if (heroContent) heroContent.classList.remove('hidden');
        }
        
        // Handle unsticky behavior at 12% scroll
        if (scrollPercent > 11 && !unstickyTriggered) {
            unstickyTriggered = true;
            if (heroContent) {
                // Calculate the exact position to prevent shift
                const rect = heroContent.getBoundingClientRect();
                const scrollY = window.pageYOffset || document.documentElement.scrollTop;
                const absoluteTop = rect.top + scrollY;
                
                heroContent.classList.add('unsticky');
                heroContent.style.top = (absoluteTop - 0) + 'px';
                heroContent.style.right = '100px';
            }
        } else if (scrollPercent <= 11 && unstickyTriggered) {
            unstickyTriggered = false;
            if (heroContent) {
                heroContent.classList.remove('unsticky');
                heroContent.style.top = '';c
                heroContent.style.right = '';
            }
        }
        
        if (scrollPercent > 7 && !fadeOutTriggered) {
            fadeOutTriggered = true;
            if (heroSubtitle) heroSubtitle.classList.add('fade-out');
            if (heroCta) heroCta.classList.add('fade-out');
        } else if (scrollPercent <= 7 && fadeOutTriggered) {
            fadeOutTriggered = false;
            if (heroSubtitle) heroSubtitle.classList.remove('fade-out');
            if (heroCta) heroCta.classList.remove('fade-out');
        }


    }

    window.addEventListener('scroll', handleScrollFadeOut);
    window.addEventListener('resize', handleScrollFadeOut);

    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('a[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                const offsetTop = targetSection.offsetTop - 80; // Account for fixed navbar
                
                // Super smooth scrolling with custom easing
                smoothScrollTo(offsetTop, 1200);
            }
        });
    });

    // Custom smooth scroll function with easing
    function smoothScrollTo(targetPosition, duration = 1200) {
        const startPosition = window.pageYOffset;
        const distance = targetPosition - startPosition;
        let startTime = null;

        function animation(currentTime) {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const run = easeInOutCubic(timeElapsed, startPosition, distance, duration);
            window.scrollTo(0, run);
            if (timeElapsed < duration) requestAnimationFrame(animation);
        }

        // Cubic easing function
        function easeInOutCubic(t, b, c, d) {
            t /= d / 2;
            if (t < 1) return c / 2 * t * t * t + b;
            t -= 2;
            return c / 2 * (t * t * t + 2) + b;
        }

        requestAnimationFrame(animation);
    }

    // Gallery item animations on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Testimonials parallax effect
    const testimonials = document.querySelectorAll('.testimonial');
    let testimonialsParallaxActive = false;

    function handleTestimonialsParallax() {
        const testimonialsSection = document.querySelector('.testimonials');
        if (!testimonialsSection || testimonials.length === 0) return;

        const sectionRect = testimonialsSection.getBoundingClientRect();
        const sectionTop = sectionRect.top;
        const sectionHeight = sectionRect.height;
        const windowHeight = window.innerHeight;

        // Only activate when section is in view
        if (sectionTop < windowHeight && sectionTop + sectionHeight > 0) {
            testimonialsParallaxActive = true;
            
            // Calculate scroll progress within the section
            const scrollProgress = Math.max(0, Math.min(1, (windowHeight - sectionTop) / (windowHeight + sectionHeight)));
            
            // Different speeds and directions for each testimonial - very dynamic
            const speed1 = scrollProgress * 120; // Left testimonial - scrolls down moderately
            const speed2 = scrollProgress * -80; // Center testimonial - scrolls up moderately
            const speed3 = scrollProgress * 90; // Right testimonial - scrolls down slowly

            testimonials[0].style.transform = `translateY(${speed1}px)`;
            testimonials[1].style.transform = `translateY(${speed2}px)`;
            testimonials[2].style.transform = `translateY(${speed3}px)`;
        } else if (testimonialsParallaxActive) {
            testimonialsParallaxActive = false;
            // Reset positions when out of view
            testimonials.forEach(testimonial => {
                testimonial.style.transform = 'translateY(0)';
            });
        }
    }

    window.addEventListener('scroll', handleTestimonialsParallax);
window.addEventListener('resize', handleTestimonialsParallax);

// Client logos color reveal on scroll
function handleLogosColorReveal() {
    const logosSection = document.querySelector('.client-logos');
    const logoItems = document.querySelectorAll('.logo-item');
    
    if (!logosSection || logoItems.length === 0) return;
    
    const sectionRect = logosSection.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const scrollProgress = (windowHeight - sectionRect.top) / windowHeight;
    
    // Start revealing at 40% scroll, complete by 60% scroll
    const startReveal = 0.40;
    const endReveal = 0.60;
    
    if (scrollProgress >= startReveal) {
        const revealProgress = (scrollProgress - startReveal) / (endReveal - startReveal);
        
        // Reveal each logo at different intervals in order
        logoItems.forEach((logo, index) => {
            const individualStart = startReveal + (index * 0.02); // Each logo starts 2% later
            
            if (scrollProgress >= individualStart) {
                logo.classList.add('colored');
            } else {
                logo.classList.remove('colored');
            }
        });
    }
}

window.addEventListener('scroll', handleLogosColorReveal);
window.addEventListener('resize', handleLogosColorReveal);

    // Observe gallery items
    const galleryItems = document.querySelectorAll('.gallery-item');
    galleryItems.forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(30px)';
        item.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(item);
    });

    // Observe value cards
    const valueCards = document.querySelectorAll('.value-card');
    valueCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = `opacity 0.6s ease ${index * 0.2}s, transform 0.6s ease ${index * 0.2}s`;
        observer.observe(card);
    });

    // Contact form handling
    const contactForm = document.querySelector('.contact-form form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(this);
            const formObject = {};
            formData.forEach((value, key) => {
                formObject[key] = value;
            });
            
            // Show success message
            showNotification('¡Gracias por tu mensaje! Te contactaremos pronto.', 'success');
            
            // Reset form
            this.reset();
        });
    }

    // CTA button handlers
    const ctaButtons = document.querySelectorAll('.cta-primary');
    ctaButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (this.textContent.includes('Consulta')) {
                // Scroll to contact section
                const contactSection = document.querySelector('#contacto');
                if (contactSection) {
                    const offsetTop = contactSection.offsetTop - 80;
                    smoothScrollTo(offsetTop, 1200);
                }
            }
        });
    });

    // Gallery button handler
    const galleryButtons = document.querySelectorAll('.cta-secondary');
    galleryButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (this.textContent.includes('Galería')) {
                const gallerySection = document.querySelector('#galeria');
                if (gallerySection) {
                    const offsetTop = gallerySection.offsetTop - 80;
                    smoothScrollTo(offsetTop, 1200);
                }
            }
        });
    });

    // Add scroll effect to navbar
    let lastScrollTop = 0;
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            // Scrolling down
            navbar.style.transform = 'translateY(-100%)';
        } else {
            // Scrolling up
            navbar.style.transform = 'translateY(0)';
        }
        
        lastScrollTop = scrollTop;
    });

    // Add hover effects to service items
    const serviceItems = document.querySelectorAll('.service-item');
    serviceItems.forEach(item => {
        const image = item.querySelector('.service-image img');
        const content = item.querySelector('.service-content');
        
        item.addEventListener('mouseenter', function() {
            if (image) {
                image.style.transform = 'scale(1.05)';
            }
        });
        
        item.addEventListener('mouseleave', function() {
            if (image) {
                image.style.transform = 'scale(1)';
            }
        });
    });

    // Stats counter animation
    const stats = document.querySelectorAll('.stat h3');
    const statsSection = document.querySelector('.stats');
    
    if (statsSection) {
        const statsObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateStats();
                    statsObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        
        statsObserver.observe(statsSection);
    }

    function animateStats() {
        stats.forEach(stat => {
            const finalValue = stat.textContent;
            const isPercentage = finalValue.includes('%');
            const numericValue = parseInt(finalValue.replace(/[^\d]/g, ''));
            
            let currentValue = 0;
            const increment = numericValue / 50; // Animation duration
            
            const timer = setInterval(() => {
                currentValue += increment;
                
                if (currentValue >= numericValue) {
                    currentValue = numericValue;
                    clearInterval(timer);
                }
                
                stat.textContent = Math.floor(currentValue) + (isPercentage ? '%' : '+');
            }, 30);
        });
    }

    // Hero Carousel functionality
    const carousel = document.querySelector('.hero-carousel');
    if (carousel) {
        const slides = carousel.querySelectorAll('.carousel-slide');
        let currentSlide = 0;
        let carouselInterval;

        function showSlide(index) {
            // Remove active class from all slides
            slides.forEach(slide => slide.classList.remove('active'));
            
            // Add active class to current slide
            slides[index].classList.add('active');
            
            currentSlide = index;
        }

        function nextSlide() {
            const nextIndex = (currentSlide + 1) % slides.length;
            showSlide(nextIndex);
        }

        function startCarousel() {
            carouselInterval = setInterval(nextSlide, 2000); // 2 seconds
        }

        function stopCarousel() {
            clearInterval(carouselInterval);
        }

        // Initialize carousel
        showSlide(0);
        startCarousel();

        // Pause carousel on hover
        carousel.addEventListener('mouseenter', stopCarousel);
        carousel.addEventListener('mouseleave', startCarousel);

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                const prevIndex = (currentSlide - 1 + slides.length) % slides.length;
                showSlide(prevIndex);
                stopCarousel();
                startCarousel();
            } else if (e.key === 'ArrowRight') {
                nextSlide();
                stopCarousel();
                startCarousel();
            }
        });
    }



    // Process timeline animations
    const processSteps = document.querySelectorAll('.process-step');
    const processObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                entry.target.style.transition = `opacity 0.8s ease ${index * 0.3}s, transform 0.8s ease ${index * 0.3}s`;
            }
        });
    }, { threshold: 0.3 });

    processSteps.forEach(step => {
        step.style.opacity = '0';
        step.style.transform = 'translateY(50px)';
        processObserver.observe(step);
    });

    // Materials cards animations
    const materialCards = document.querySelectorAll('.material-card');
    const materialsObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                entry.target.style.transition = `opacity 0.6s ease ${index * 0.2}s, transform 0.6s ease ${index * 0.2}s`;
            }
        });
    }, { threshold: 0.2 });

    materialCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        materialsObserver.observe(card);
    });


});

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${type === 'success' ? '#8B1538' : '#333'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        transform: translateX(400px);
        transition: transform 0.3s ease;
        max-width: 350px;
    `;
    
    const content = notification.querySelector('.notification-content');
    content.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    `;
    
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    `;
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Close button functionality
    closeBtn.addEventListener('click', function() {
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => {
            notification.remove();
        }, 300);
    });
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }
    }, 5000);
}

// Add loading animations for images
document.addEventListener('DOMContentLoaded', function() {
    const images = document.querySelectorAll('img');
    
    images.forEach(img => {
        img.addEventListener('load', function() {
            this.style.opacity = '1';
        });
        
        // Set initial opacity
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.5s ease';
        
        // If already loaded
        if (img.complete) {
            img.style.opacity = '1';
        }
    });
});

    // Mobile menu toggle (for future mobile optimization)
    function toggleMobileMenu() {
        const navMenu = document.querySelector('.nav-menu');
        const navbar = document.querySelector('.navbar');
        
        navMenu.classList.toggle('mobile-active');
        navbar.classList.toggle('mobile-menu-open');
    }

    // Gallery cursor effect
    const galleryItems = document.querySelectorAll('.gallery-item');
    let cursorElement = null;

    // Create cursor element
    function createCursor() {
        if (!cursorElement) {
            cursorElement = document.createElement('div');
            cursorElement.className = 'gallery-cursor';
            cursorElement.innerHTML = 'VER<br>ROLLERS';
            document.body.appendChild(cursorElement);
        }
    }

    createCursor();

    galleryItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            if (cursorElement) {
                cursorElement.style.opacity = '1';
            }
        });

        item.addEventListener('mousemove', function(e) {
            if (cursorElement) {
                cursorElement.style.left = e.clientX + 'px';
                cursorElement.style.top = e.clientY + 'px';
            }
        });

        item.addEventListener('mouseleave', function() {
            if (cursorElement) {
                cursorElement.style.opacity = '0';
            }
        });
    });

    // Bento cursor image functionality
    const bentoItems = document.querySelectorAll('.bento-item');
    let bentoCursorImage = null;
    const bentoImages = [
        'landing-media/sala-amplia-ventanal.jpeg',
        'landing-media/recamara-master.jpeg',
        'landing-media/sala-playera.jpeg',
        'landing-media/silla-y-ventana.jpeg',
        'landing-media/sala-pequeña.jpeg',
        'landing-media/lobby-con-cortinas.jpg',
        'landing-media/comedor-moderno.jpeg',
        'landing-media/sala-con-pintura.jpeg',
        'landing-media/comedor.jpeg',
        'landing-media/comedor-moderno-closeup.jpeg',
        'landing-media/sala-roller.jpg'
    ];

    function createBentoCursorImage() {
        if (bentoCursorImage) return;
        
        bentoCursorImage = document.createElement('img');
        bentoCursorImage.className = 'bento-cursor-image';
        document.body.appendChild(bentoCursorImage);
    }

    function getRandomBentoImage() {
        const randomIndex = Math.floor(Math.random() * bentoImages.length);
        return bentoImages[randomIndex];
    }

    createBentoCursorImage();

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    function animateBentoImage() {
        if (bentoCursorImage && bentoCursorImage.classList.contains('visible')) {
            currentX += (targetX - currentX) * 0.1;
            currentY += (targetY - currentY) * 0.1;
            
            bentoCursorImage.style.left = currentX + 'px';
            bentoCursorImage.style.top = currentY + 'px';
        }
        requestAnimationFrame(animateBentoImage);
    }

    animateBentoImage();

    bentoItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            if (!bentoCursorImage) {
                createBentoCursorImage();
            }
            if (bentoCursorImage) {
                bentoCursorImage.src = getRandomBentoImage();
                bentoCursorImage.classList.add('visible');
            }
        });

        item.addEventListener('mousemove', function(e) {
            targetX = e.clientX;
            targetY = e.clientY - 105;
        });

        item.addEventListener('mouseleave', function() {
            if (bentoCursorImage) {
                bentoCursorImage.classList.remove('visible');
            }
        });
    });

    // Hide image when leaving the entire bento section
    const bentoSection = document.querySelector('.bento-grid');
    if (bentoSection) {
        bentoSection.addEventListener('mouseleave', function() {
            if (bentoCursorImage) {
                bentoCursorImage.classList.remove('visible');
                // Remove element after transition completes
                setTimeout(() => {
                    if (bentoCursorImage && !bentoCursorImage.classList.contains('visible')) {
                        bentoCursorImage.remove();
                        bentoCursorImage = null;
                    }
                }, 300);
            }
        });
    } 