# STARR SURVEYING - Brand Style Guide

> **Single source of truth** for all visual design, styling decisions, and brand consistency.
> Referenced by: Website, Admin Portal, Marketing Materials, Advertising.
>
> **Last Updated:** February 2026

---

## Table of Contents

1. [Brand Colors](#1-brand-colors)
2. [Typography](#2-typography)
3. [Buttons](#3-buttons)
4. [Cards](#4-cards)
5. [Forms & Inputs](#5-forms--inputs)
6. [Alerts & Status](#6-alerts--status)
7. [Shadows](#7-shadows)
8. [Border Radius](#8-border-radius)
9. [Spacing & Layout](#9-spacing--layout)
10. [Animations & Transitions](#10-animations--transitions)
11. [Responsive Breakpoints](#11-responsive-breakpoints)
12. [Header & Footer Signature Design](#12-header--footer-signature-design)
13. [Admin Portal Styling](#13-admin-portal-styling)
14. [Logo & Brand Assets](#14-logo--brand-assets)
15. [CSS Architecture](#15-css-architecture)
16. [Design Rules & Principles](#16-design-rules--principles)

---

## 1. Brand Colors

All brand colors are defined as CSS custom properties in `app/styles/globals.css` under `:root`.

### Primary Palette

| Token | CSS Variable | Hex | Usage |
|-------|-------------|-----|-------|
| **Brand Red** | `--brand-red` | `#BD1218` | Primary CTA, accents, header background, active states |
| **Brand Blue** | `--brand-blue` | `#1D3095` | Secondary brand, navbar, borders, form focus states |
| **Brand Green** | `--brand-green` | `#10B981` | Pricing CTA, estimate banner, success indicators |
| **Brand Dark** | `--brand-dark` | `#0F1419` | Primary text, headings |
| **Brand Light** | `--brand-light` | `#F8F9FA` | Light section backgrounds |
| **Brand Gray** | `--brand-gray` | `#6B7280` | Muted text, secondary labels |
| **Brand White** | `--brand-white` | `#FFFFFF` | Backgrounds, text on dark surfaces |

### Hover / Dark Variants

| Token | CSS Variable | Hex | Usage |
|-------|-------------|-----|-------|
| **Red Dark** | `--brand-red-dark` | `#9A0F14` | Red button hover state |
| **Blue Dark** | `--brand-blue-dark` | `#152050` | Blue button hover, footer bottom bar |
| **Green Dark** | `--brand-green-dark` | `#059669` | Green button hover state |

### Text Colors

| Token | CSS Variable | Hex | Usage |
|-------|-------------|-----|-------|
| **Primary Text** | `--text-primary` | `#0F1419` | Headings, labels, strong text |
| **Secondary Text** | `--text-secondary` | `#4B5563` | Paragraph body text |
| **Muted Text** | `--text-muted` | `#6B7280` | Captions, descriptions, placeholders |

### Borders

| Token | CSS Variable | Hex | Usage |
|-------|-------------|-----|-------|
| **Border Color** | `--border-color` | `#E5E7EB` | Default borders, form outlines, dividers |

### Gradients

| Token | CSS Variable | Value | Usage |
|-------|-------------|-------|-------|
| **Hero Gradient** | `--gradient-hero` | `linear-gradient(135deg, #BD1218 20%, #1D3095 80%)` | Hero sections, CTA banners |
| **Blue Gradient** | `--gradient-blue` | `linear-gradient(135deg, #1D3095 0%, #152050 100%)` | "Why Choose Us" sections, CTAs |
| **Green Gradient** | `--gradient-green` | `linear-gradient(135deg, #10B981 0%, #059669 100%)` | Estimate banners |

### Color Usage Rules

- **SOLID colors only for text** -- never use gradients on text
- Gradients are reserved for **section backgrounds** (hero, CTA banners)
- Red (`--brand-red`) is the **primary action color** (main CTA buttons)
- Blue (`--brand-blue`) is the **secondary action color** (secondary buttons, nav)
- Green (`--brand-green`) is for **pricing/quote actions only**
- Section dividers use `4px solid` borders in brand red or blue

---

## 2. Typography

### Font Families

| Role | Font | CSS Variable (Tailwind) | Fallbacks |
|------|------|------------------------|-----------|
| **Display / Headings** | Sora | `font-display` | system-ui, sans-serif |
| **Body / UI Text** | Inter | `font-body` | system-ui, sans-serif |

**Font Import:** Google Fonts
```
Sora: weights 400, 500, 600, 700
Inter: weights 400, 500, 600, 700, 800
```

### Heading Scale

| Element | Font | Size (Desktop) | Size (Mobile <=768px) | Weight | Letter Spacing |
|---------|------|---------------|----------------------|--------|---------------|
| `h1` | Sora | 3.5rem (56px) | 2.25rem (36px) | 700 | -0.02em |
| `h2` | Sora | 2.5rem (40px) | 1.875rem (30px) | 700 | -0.02em |
| `h3` | Sora | 1.5rem (24px) | -- | 600 | -- |
| `h4` | Sora | 1.125rem (18px) | -- | 600 | -- |

### Body Text

| Element | Font | Size | Line Height | Color |
|---------|------|------|-------------|-------|
| Paragraph (`p`) | Inter | 1rem (16px) | 1.8 | `--text-secondary` (#4B5563) |
| Labels | Sora or Inter | 0.85-0.95rem | 1.4 | `--text-primary` (#0F1419) |
| Captions / Small | Inter | 0.75rem (12px) | 1.4 | `--text-muted` (#6B7280) |

### Tailwind Font Size Scale (with tracking)

| Token | Size | Line Height | Letter Spacing |
|-------|------|-------------|---------------|
| `text-xs` | 0.75rem | 1rem | 0.01em |
| `text-sm` | 0.875rem | 1.25rem | 0.005em |
| `text-base` | 1rem | 1.5rem | -- |
| `text-lg` | 1.125rem | 1.75rem | -- |
| `text-xl` | 1.25rem | 1.75rem | -0.01em |
| `text-2xl` | 1.5rem | 2rem | -0.01em |
| `text-3xl` | 1.875rem | 2.25rem | -0.02em |
| `text-4xl` | 2.25rem | 2.5rem | -0.02em |
| `text-5xl` | 3rem | 1.2x | -0.03em |

---

## 3. Buttons

### Button Variants

| Variant | Class | Background | Text | Border | Hover BG | Hover Text |
|---------|-------|-----------|------|--------|----------|------------|
| **Primary** | `.btn-primary` | `--brand-red` | white | `--brand-red` | `--brand-red-dark` | white |
| **Secondary** | `.btn-secondary` | `--brand-blue` | white | `--brand-blue` | `--brand-blue-dark` | white |
| **Outline** | `.btn-outline` | transparent | `--brand-red` | `--brand-red` | `--brand-red` | white |
| **Ghost** | `.btn-ghost` | transparent | `--brand-dark` | `--border-color` | `--brand-light` | `--brand-red` |
| **Green (Pricing)** | navbar-specific | `--brand-green` | white | white | `--brand-green-dark` | white |

### Button Base Specs (`.btn` class)

```
Font Family:    Sora
Font Size:      0.95rem
Font Weight:    600
Padding:        1rem 1.75rem (large) / 0.75rem 1.5rem (standard)
Border:         2px solid
Border Radius:  var(--radius-md) = 8px
Letter Spacing: 0.3px
Transition:     var(--transition-fast) = 0.2s ease
```

### Page-Level Button Specs

Page-specific buttons (hero, CTA sections) use slightly different sizing:

```
Font Size:      0.85-0.95rem
Padding:        0.75rem 1.5rem
Border Radius:  var(--radius-sm) = 6px
```

---

## 4. Cards

### Standard Card (`.card`)

```
Background:     white
Border:         1px solid var(--border-color)
Border Radius:  var(--radius-lg) = 12px
Padding:        2rem
Shadow:         var(--shadow-sm)
Hover:          border-color changes to var(--brand-red)
Transition:     var(--transition-fast)
```

### Card Variants

| Variant | Class | Extra Styling |
|---------|-------|--------------|
| **Red Accent** | `.card-accent` | `border-left: 4px solid var(--brand-red)` |
| **Blue Accent** | `.card-accent-blue` | `border-left: 4px solid var(--brand-blue)` |
| **Hero Card** | page-specific | `border: 3px solid var(--brand-blue)`, `shadow: var(--shadow-hero)` |
| **Feature Card** | `.feature-card` | `border-radius: var(--radius-lg)`, `padding: 2.5rem 2rem` |

### Service Cards (Home Page)

```
Background:     var(--brand-light) (#F8F9FA)
Border-Left:    4px solid var(--brand-blue)
Border Radius:  var(--radius-md) = 8px
Padding:        1rem
Hover:          border-left-color changes to var(--brand-red)
```

---

## 5. Forms & Inputs

### Input Fields

```
Font Family:    Inter
Font Size:      0.9-1rem
Padding:        0.875rem 1rem (global) / 0.65rem 0.9rem (page-level)
Border:         2px solid var(--border-color)
Border Radius:  var(--radius-md) = 8px
Focus:          border-color: var(--brand-blue)
Background:     white
Transition:     var(--transition-fast)
```

### Textarea

```
Same as input, plus:
Resize:         vertical
Min Height:     140px (global) / 100px (page-level compact)
```

### Labels

```
Font Family:    Sora (page-level) or Inter (global)
Font Size:      0.85-0.95rem
Font Weight:    600
Color:          var(--text-primary)
Margin Bottom:  0.4-0.625rem
Required:       Red asterisk using ::after { content: ' *'; color: var(--brand-red) }
```

### Select Dropdowns

```
Same styling as inputs
```

---

## 6. Alerts & Status

| Type | Background | Text Color | Border |
|------|-----------|------------|--------|
| **Success** | `#F0FDF4` | `#166534` | `border-left: 4px solid #22C55E` |
| **Error** | `#FEF2F2` | `var(--brand-red)` | `border-left: 4px solid var(--brand-red)` |
| **Success (Contact)** | `#ECFDF5` | `#065F46` (title) / `#047857` (text) | `border: 2px solid var(--brand-green)` |
| **Error (Contact)** | `#FEF2F2` | `var(--brand-red)` | `border: 2px solid var(--brand-red)` |

### Alert Base (`.alert`)

```
Padding:        1.5rem
Border Radius:  var(--radius-md)
Margin Bottom:  1.5rem
Font Weight:    500
Border Left:    4px solid transparent (base)
```

---

## 7. Shadows

All shadow values are defined as CSS variables in `:root`.

| Level | CSS Variable | Value | Usage |
|-------|-------------|-------|-------|
| **Small** | `--shadow-sm` | `0 1px 3px rgba(15,20,25,0.05)` | Cards at rest, subtle elevation |
| **Medium** | `--shadow-md` | `0 4px 12px rgba(15,20,25,0.08)` | Dropdowns, tooltips |
| **Large** | `--shadow-lg` | `0 8px 24px rgba(15,20,25,0.1)` | Modals, floating panels |
| **Extra Large** | `--shadow-xl` | `0 12px 32px rgba(15,20,25,0.12)` | Large overlays |
| **Brand** | `--shadow-brand` | `0 8px 32px rgba(189,18,24,0.15)` | Brand-highlighted cards |
| **Hero** | `--shadow-hero` | `0 8px 32px rgba(0,0,0,0.2)` | Hero cards, prominent cards |
| **Button** | `--shadow-button` | `0 4px 12px rgba(0,0,0,0.3)` | Floating buttons, mobile menu |

---

## 8. Border Radius

| Token | CSS Variable | Value | Usage |
|-------|-------------|-------|-------|
| **Small** | `--radius-sm` | `6px` | Page-level buttons, small badges |
| **Medium** | `--radius-md` | `8px` | Global buttons, inputs, alerts, dropdowns |
| **Large** | `--radius-lg` | `12px` | Cards, hero cards, feature cards |

---

## 9. Spacing & Layout

### Container Max Widths

| Context | Max Width | Usage |
|---------|----------|-------|
| **Standard** | `1280px` | Default `.container` class |
| **Wide** | `1400px` | Footer |
| **Content** | `1200px` | Services grid, feature sections |
| **Hero** | `1100px` | Home hero |
| **Narrow** | `900px` | About/Services/Pricing heroes, service area |
| **Form** | `800px` | Contact form, CTA sections |

### Section Padding

| Size | Value | Usage |
|------|-------|-------|
| **Large** | `5rem 2rem` | `.section` class |
| **Medium** | `3.5rem 2rem` | Page content sections |
| **Small** | `3rem 2rem` | `.section-sm`, hero sections |
| **Compact** | `2.5rem 2rem` | CTA sections |

### Grid System

| Class | Columns | Min Width | Gap |
|-------|---------|-----------|-----|
| `.grid-1` | 1 | -- | 2rem |
| `.grid-2` | auto-fit | 400px | 2rem |
| `.grid-3` | auto-fit | 320px | 2rem |
| `.feature-grid` | auto-fit | 280px | 2rem |

### Standard Gaps

```
Default grid gap:   2rem
Compact grid gap:   1.25rem (services), 1rem (why section)
Button group gap:   1rem
Form element gap:   1rem (grid), 1.5rem (margin-bottom)
```

---

## 10. Animations & Transitions

### CSS Transition Variables

| Token | CSS Variable | Value | Usage |
|-------|-------------|-------|-------|
| **Fast** | `--transition-fast` | `0.2s ease` | Buttons, links, hover states |
| **Normal** | `--transition-normal` | `0.3s ease` | Dropdowns, modals, larger elements |

### Keyframe Animations (Tailwind)

| Name | Duration | Easing | Effect |
|------|----------|--------|--------|
| `fade-in` | 0.6s | ease-out | Opacity 0 → 1 |
| `slide-up` | 0.6s | ease-out | translateY(20px) → 0 + fade |
| `slide-in` | 0.8s | ease-out | translateX(-20px) → 0 + fade |
| `slide-down` | 0.3s | ease-out | translateY(-10px) → 0 + fade |

### Component Animations

| Name | Duration | Usage |
|------|----------|-------|
| `fadeInDown` | 0.3s ease-out | Scrolled header appearance |
| `slideDown` | 0.3s ease-out | Mobile dropdown menus |
| `bounce-subtle` | 2s ease-in-out infinite | Estimate banner icon |
| `home-spin` | 1s linear infinite | Map loading spinner |

### Hover Patterns

- **Buttons:** Color transition only (no scale, except nav links use `scale(0.95)`)
- **Cards:** Border-color transition to `--brand-red`
- **Links:** Color change from `--brand-red` → `--brand-blue`
- **Footer links:** `translateX(5px)` slide right
- **CTA buttons:** `translateY(-2px)` lift up
- **Back to top:** `scale(1.1)` grow

---

## 11. Responsive Breakpoints

### Header & Footer (15 Granular Breakpoints)

These components use CSS custom property overrides at each breakpoint for pixel-perfect scaling.

| # | Range | Name | Key Changes |
|---|-------|------|-------------|
| 1 | 0-399px | Extra Small Mobile | Mobile menu, hide back-to-top |
| 2 | 400-499px | Small Mobile | Mobile menu, hide back-to-top |
| 3 | 500-599px | Medium Mobile | Mobile menu, hide back-to-top |
| 4 | 600-767px | Large Mobile | Mobile menu, hide back-to-top |
| 5 | 768-899px | Small Tablet | Desktop nav appears |
| 6 | 900-1023px | Large Tablet | Desktop nav |
| 7 | 1024-1149px | Small Desktop | Full desktop |
| 8 | 1150-1279px | Desktop | Full desktop |
| 9 | 1280-1439px | Large Desktop | Full desktop |
| 10 | 1440-1599px | XL Desktop | Full desktop |
| 11 | 1600-1799px | XXL Desktop | Full desktop |
| 12 | 1800-1919px | Full HD | Full desktop |
| 13 | 1920-2199px | Full HD+ | **BASE VALUES** |
| 14 | 2200-2559px | QHD | Scaled up |
| 15 | 2560px+ | 4K+ | Scaled up |

### Page Content (6 Breakpoints)

| Range | Name | Grid Columns | Hero Title |
|-------|------|-------------|------------|
| 1280px+ | Large Desktop | 3-col | 2.25rem |
| 1024-1279px | Desktop | 3-col | 2rem |
| 768-1023px | Tablet | 2-col | 2rem |
| 600-767px | Large Mobile | 2-col | 1.65rem |
| 480-599px | Medium Mobile | 2-col | 1.5rem |
| 0-479px | Small Mobile | 1-col | 1.25rem |

### Key Responsive Behaviors

- **Mobile (< 768px):** Stack all grids to 1 or 2 columns, full-width buttons, hamburger menu
- **Tablet (768-1023px):** 2-column grids, hero stats become horizontal row
- **Desktop (1024px+):** Full layout with desktop navigation bar

---

## 12. Header & Footer Signature Design

### Header

- **Red box** (`--brand-red`) fills the top area with a blue (`--brand-blue`) border
- **Logo** floats above the header box using absolute positioning
- **Navbar** is an angled bar using `clip-path: polygon()` with blue outer + red inner layers
- **Scrolled state:** Fixed red bar with blue bottom border, hamburger menu, quote button
- **Back-to-top:** Red circle with blue border, appears on desktop only

### Footer

- **Angled top edge:** Red base with blue overlay (creates a red "border" effect)
- **Main content:** Solid blue (`--brand-blue`) background
- **Grid:** 4-column layout (brand, services, quick links, contact)
- **Headings:** White with red bottom border (2px)
- **Bottom bar:** Dark blue (`--brand-blue-dark`) with copyright and location
- **Employee login:** Subtle low-opacity link in bottom bar

### Section Dividers

- Sections alternate between `border-top: 4px solid var(--brand-blue)` and `border-top: 4px solid var(--brand-red)`
- Pattern: Hero (gradient) → Services (blue border) → Why (no border, blue bg) → Area (red border) → Contact (blue border) → CTA (no border, gradient bg)

---

## 13. Admin Portal Styling

### Sidebar (260px Fixed)

```
Background:     linear-gradient(180deg, #152050, #1D3095)
Active Link:    border-left: 3px solid var(--brand-red), white text
Section Labels: uppercase, 0.65rem, 0.8px letter-spacing
Font:           Inter for all text, Sora for brand name
```

### Top Bar (64px Fixed)

```
Background:     white
Border Bottom:  2px solid var(--border-color)
Title Font:     Sora, 1.15rem, 600 weight
Role Badges:    Admin = red bg (#FEF2F2), Employee = blue bg (#EFF6FF)
```

### Admin Color Usage

- Same brand palette as public site
- **Avatar placeholder:** Red background, white Sora text
- **Sign out hover:** Light red background (#FEF2F2)
- **XP badge:** Green for current, blue for total

---

## 14. Logo & Brand Assets

### Logo Files (in `/public/logos/`)

| File | Usage |
|------|-------|
| `Fancy_Logo_Nav_Background.png` | Header/navigation |
| `Fancy_Logo_red_darkblue_white.png` | Primary brand logo |
| `Fancy_Logo_red_darkblue_white_2.png` | Alt brand logo |
| `star_circle_blue_red.png` | Circular star mark |
| `Starr_Surveying_RED_WHITE_BLUE_STAR_GRADIENT.png` | Star gradient mark |
| `og-image.png` | Social media sharing |

### Favicon & App Icons

| File | Size |
|------|------|
| `favicon-16x16.png` | 16x16 |
| `favicon-32x32.png` | 32x32 |
| `apple-touch-icon.png` | 180x180 |
| `icon-192x192.png` | 192x192 |
| `icon-512x512.png` | 512x512 |

---

## 15. CSS Architecture

### Technology Stack

- **Tailwind CSS 3.3.6** -- utility-first framework
- **PostCSS** with autoprefixer
- **Next.js 14** -- server-side rendering
- **Custom CSS files** -- page-specific styling with BEM-like naming
- **CSS Custom Properties** -- design tokens in `:root`

### File Structure

```
app/styles/
  globals.css          ← Design tokens, base styles, reusable components
  Header.css           ← Header + navigation (15 breakpoints)
  Footer.css           ← Footer (15 breakpoints)
  Home.css             ← Home page sections
  About.css            ← About page
  Services.css         ← Services page
  Contact.css          ← Contact page
  Pricing.css          ← Pricing page
  Credentials.css      ← Credentials page
  Resources.css        ← Resources page
  ServiceArea.css      ← Service area page

app/admin/styles/
  AdminLayout.css      ← Sidebar, topbar, main layout
  AdminResponsive.css  ← Admin mobile breakpoints
  Admin[Feature].css   ← Feature-specific admin styles (19 files)

tailwind.config.ts     ← Tailwind theme extensions
postcss.config.js      ← PostCSS plugins
```

### Naming Convention

- **Public pages:** BEM-like with page prefix: `.home-hero__title`, `.services-hero__card`
- **Admin pages:** BEM-like with admin prefix: `.admin-sidebar__link--active`
- **Global utilities:** Simple class names: `.btn-primary`, `.card`, `.section`

### CSS Variable Hierarchy

1. **`globals.css :root`** -- Canonical source of truth for all design tokens
2. **`Header.css :root`** -- Header-specific variables (reference globals tokens)
3. **Page CSS files** -- Use `var()` references to globals tokens

---

## 16. Design Rules & Principles

### DO

- Use CSS variables for all brand colors (never hardcode hex in new CSS)
- Use `font-family: 'Sora'` for headings and buttons
- Use `font-family: 'Inter'` for body text and UI elements
- Use solid colors for text (NEVER gradients on text)
- Use `var(--transition-fast)` for interactive hover states
- Use `var(--radius-sm)` (6px) for buttons, `var(--radius-md)` (8px) for inputs, `var(--radius-lg)` (12px) for cards
- Add `overflow-x: hidden` on sections that may cause horizontal scroll
- Use the existing gradient variables for hero/CTA backgrounds
- Match the 15-breakpoint system for header/footer changes
- Match the 6-breakpoint system for page content changes

### DON'T

- Don't use gradient text (all text is solid colored)
- Don't introduce new colors without adding them to `:root` in globals.css
- Don't use `px` for font sizes (use `rem`)
- Don't hardcode hex color values in new CSS files
- Don't use more than 3 shadow levels on a single page
- Don't mix Sora and Inter for the same text role
- Don't add new breakpoints without updating both header and page CSS

### Advertising & Marketing Guidelines

When creating external marketing materials:

- **Primary brand color pair:** Red `#BD1218` + Blue `#1D3095`
- **Accent color:** Sea Green `#10B981` (for calls-to-action)
- **Headlines:** Sora Bold (700)
- **Body copy:** Inter Regular (400) or Medium (500)
- **Logo clearance:** Maintain padding equal to logo height on all sides
- **Gradient usage:** Only for backgrounds, never text. Direction: 135deg, Red 20% → Blue 80%
- **Dark backgrounds:** Use blue (`#1D3095`) or dark blue (`#152050`), never black
- **Light backgrounds:** Use `#F8F9FA` (warm gray), never pure `#F0F0F0`

---

*This style guide is maintained alongside the codebase. All design tokens live in `app/styles/globals.css` and `tailwind.config.ts`. Update this document when adding new patterns or modifying existing ones.*
