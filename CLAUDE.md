# Edecoration S.A. - Project Documentation

## Project Overview

**Edecoration S.A.** is a luxury curtains and blinds company website project in Panama. This project consists of two implementations:
1. A static HTML/CSS/JavaScript website (production-ready landing page)
2. A Next.js application (in development, currently using default template)

**Business Context:**
- Company: Edecoration S.A. - Luxury curtains and blinds provider in Panama
- Established: 2004 (20 years of experience)
- Target Market: Residential, commercial, and corporate clients
- Services: Custom curtains, intelligent blinds, consultation, installation, and maintenance

## Technology Stack

### Static Website (Main Implementation)
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Custom CSS with CSS custom properties (variables)
- **Typography**: Google Fonts (Playfair Display, Inter)
- **Icons**: Font Awesome 6.4.0
- **Media**: Responsive images, HTML5 video backgrounds
- **Language**: Spanish (ES)

### Next.js Application (Development Version)
- **Framework**: Next.js 14.2.5 with App Router
- **Language**: TypeScript 5.8.3
- **Styling**: Tailwind CSS 4.1.11
- **UI Libraries**: 
  - Framer Motion 12.23.6 (animations)
  - Lucide React 0.525.0 (icons)
- **Development Tools**:
  - ESLint 9 with Next.js configuration
  - PostCSS with Tailwind integration
  - Turbopack for development builds

## Directory Structure

```
edecoration/
├── index.html                  # Main static website (production)
├── styles.css                  # Main stylesheet with custom properties
├── script.js                   # Interactive JavaScript features
├── media/                      # Product and project images
├── landing-media/              # Curated landing page images
├── video/                      # Hero background videos
└── edecoration-nextjs/         # Next.js development version
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx      # Root layout
    │   │   ├── page.tsx        # Home page (default template)
    │   │   └── globals.css     # Global styles
    │   ├── components/         # React components (empty)
    │   └── lib/                # Utility functions (empty)
    ├── public/                 # Static assets
    ├── package.json            # Dependencies and scripts
    ├── tsconfig.json           # TypeScript configuration
    ├── next.config.ts          # Next.js configuration
    ├── eslint.config.mjs       # ESLint configuration
    └── postcss.config.mjs      # PostCSS configuration
```

## Available Scripts

### Next.js Application
```bash
# Development with Turbopack (faster builds)
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Run ESLint
npm run lint
```

### Static Website
- Direct file serving (no build process required)
- Can be served with any static web server
- No dependencies or build tools needed

## Key Features

### Static Website Features
1. **Hero Section**: Video background with overlay, animated content
2. **Value Proposition**: Three-column grid highlighting company strengths
3. **Testimonials**: Customer reviews with star ratings
4. **Gallery**: Project showcase with responsive grid layout
5. **Products Section**: Bento box layout for different product categories
6. **Services**: Detailed service descriptions with images
7. **About Section**: Company story with statistics
8. **Contact Form**: Lead generation with project type selection
9. **Footer**: Comprehensive site navigation and contact information

### Interactive Features
- Scroll-triggered animations (fade-out effects)
- Smooth scrolling navigation
- Responsive design for all screen sizes
- Video background with fallback
- Form handling (frontend only)

## Design System

### Color Palette
```css
--primary-white: #ffffff;
--text-black: #000000;
--wine-red: #5D0F25;        /* Primary brand color */
--accent-yellow: #F4E4BC;    /* Accent color */
--light-gray: #fdfaf5;
--medium-gray: #6c757d;
--dark-gray: #2a2a2a;
```

### Typography
- **Display Font**: Playfair Display (serif) - for headings
- **Body Font**: Inter (sans-serif) - for body text
- **Type Scale**: 1.25 ratio with responsive scaling
- **Font Weights**: 200-600 range

### Layout System
- **Container**: Max-width 1200px, centered
- **Grid Systems**: CSS Grid and Flexbox
- **Breakpoints**: Mobile-first responsive design
- **Spacing**: Consistent padding and margins

## Configuration Files

### Next.js Configuration
- **TypeScript**: Strict mode enabled, ES2017 target
- **Path Aliases**: `@/*` maps to `./src/*`
- **ESLint**: Next.js core web vitals + TypeScript rules
- **Tailwind**: v4 with PostCSS integration
- **Next.js Config**: Minimal configuration (room for customization)

### CSS Architecture
- **Custom Properties**: Extensive use of CSS variables
- **Modular Structure**: Component-based styling
- **Responsive Design**: Mobile-first approach
- **Animations**: CSS transitions and transforms

## Development Workflow

### Getting Started
1. **Static Website**: Open `index.html` in browser or serve with any static server
2. **Next.js App**: 
   ```bash
   cd edecoration-nextjs
   npm install
   npm run dev
   ```

### Development Guidelines
1. **Code Style**: Follow ESLint configuration for Next.js project
2. **Responsive Design**: Mobile-first approach
3. **Performance**: Optimize images, use appropriate formats
4. **Accessibility**: Semantic HTML, proper ARIA labels
5. **SEO**: Meta tags, structured data, semantic markup

### Content Management
- **Images**: Store in appropriate media folders
- **Content**: Currently hardcoded (consider CMS integration)
- **Translations**: Single language (Spanish) implementation

## Project Status

### Completed (Static Website)
- ✅ Complete landing page with all sections
- ✅ Responsive design implementation
- ✅ Interactive JavaScript features
- ✅ Professional styling and animations
- ✅ SEO-optimized markup
- ✅ Contact form structure

### In Development (Next.js)
- 🔄 Default Next.js template (needs customization)
- 🔄 Component library setup
- 🔄 Content migration from static version
- 🔄 API integration for contact forms
- 🔄 Admin panel/CMS integration

### Planned Enhancements
- 📋 Contact form backend integration
- 📋 Gallery management system
- 📋 Multi-language support (English)
- 📋 Analytics integration
- 📋 Performance optimization
- 📋 SEO enhancements
- 📋 Content Management System

## Technical Considerations

### Performance
- **Static Website**: Excellent performance, minimal dependencies
- **Next.js**: Requires optimization for production deployment
- **Images**: Multiple high-resolution images need optimization
- **Videos**: Large video files may need compression

### Deployment
- **Static**: Can be deployed to any static hosting (Netlify, Vercel, GitHub Pages)
- **Next.js**: Requires Node.js hosting or serverless deployment
- **CDN**: Consider CDN for media assets

### Security
- No sensitive data exposure detected
- Forms need backend validation
- HTTPS required for production

### Maintenance
- **Dependencies**: Next.js project requires regular updates
- **Content**: Static content needs manual updates
- **Media**: Large media library needs organization

## Recommendations

1. **Immediate**: Complete Next.js component migration from static version
2. **Short-term**: Implement contact form backend and CMS
3. **Medium-term**: Add e-commerce functionality for product catalogs
4. **Long-term**: Multi-language support and advanced features

## Contact Information
- **Website**: Edecoration S.A. luxury curtains and blinds
- **Location**: Vía Brasil, Plaza Madrid, Local 15, Ciudad de Panamá
- **Phone**: +507 123-4567
- **WhatsApp**: +507 6123-4567
- **Email**: info@edecoration.pa

---

*This documentation provides a comprehensive overview of the Edecoration S.A. website project structure, technologies, and development guidelines for AI coding assistants and developers.*