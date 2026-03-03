# Starr Surveying Platform

Professional land surveying platform built with Next.js 14, TypeScript, React 18, and Tailwind CSS. Combines a public-facing company website, an internal admin portal with learning management, job tracking, payroll, and an AI-powered property research and plat drawing system.

**Company:** Starr Surveying Company — Belton, Texas
**Last Updated:** March 2026

---

## Platform Overview

### Public Website (10 Pages)
- Home, About, Services, Resources, Service Area, Credentials, Contact, Pricing
- Free Estimate and Get a Quote flows
- SEO optimized with responsive design across 15 breakpoints

### Admin Portal
- **Learning Management** — Modules, lessons (block-based), quizzes, flashcards, exam prep, XP/rewards
- **Job Management** — Job tracking, lead management, scheduling
- **Employee Management** — Hours tracking, payroll, payout log, role-based access (admin/teacher/employee)
- **AI Property Research** — Document upload, AI-powered analysis, property search across 40+ Texas counties, plat drawing renderer with confidence scoring
- **Dashboard** — Education metrics, activity log, system settings

### Role-Based Access
| Feature | Admin | Teacher | Employee |
|---------|-------|---------|----------|
| Create/edit content | Yes | Yes | No |
| View student progress | Yes | Yes | No |
| Manage jobs/payroll | Yes | No | No |
| System settings | Yes | No | No |
| Learning content | Yes | Yes | Yes |

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 14.2.35 |
| Language | TypeScript (strict) | 5.3.3 |
| Frontend | React | 18.2.0 |
| Styling | Tailwind CSS | 3.3.6 |
| Database | Supabase (PostgreSQL) | — |
| Auth | NextAuth v5 (Google OAuth + Credentials) | — |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) | ^0.74.0 |
| Email | Mailgun | — |
| Hosting | Vercel | — |
| PDF Processing | pdf-parse, mammoth | — |
| Rich Text Editor | TipTap | ^2.11.0 |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build
```bash
npm run build
npm start
```

### Type Checking
```bash
npm run type-check
```

### Database Seeding
```bash
./seeds/run_all.sh --reset
```

---

## Project Structure

```
STARR-SURVEYING/
├── app/
│   ├── (public pages)/          # Home, About, Services, etc.
│   ├── admin/                   # Admin portal
│   │   ├── dashboard/           # Main dashboard
│   │   ├── learn/               # Learning management
│   │   ├── jobs/                # Job tracking
│   │   ├── research/            # AI property research
│   │   └── ...                  # Payroll, hours, settings, etc.
│   ├── api/
│   │   └── admin/               # API route handlers
│   └── styles/                  # CSS files (globals, page-specific)
├── components/                  # Shared React components
├── lib/                         # Business logic & services
│   ├── auth.ts                  # Authentication helpers
│   ├── supabase.ts              # Database client
│   ├── research/                # AI research services (16 files)
│   └── ...
├── types/                       # TypeScript type definitions
├── seeds/                       # Database seed files (000-090)
├── public/                      # Static assets, logos, images
├── PLAN.md                      # Research module implementation plan
├── IMPROVEMENT_ROADMAP.md       # Platform improvement phases (1-8)
├── STYLE_GUIDE.md               # Brand style guide
├── STARR_CAD_PHASE_ROADMAP.md   # STARR CAD 7-phase roadmap
├── STARR_CAD_PHASE_1_ENGINE_CORE.md  # CAD Phase 1 detailed spec
└── STARR_CAD_IMPLEMENTATION.md  # CAD master implementation spec
```

---

## Key Documentation

| Document | Purpose |
|----------|---------|
| `README.md` | This file — platform overview and quickstart |
| `PLAN.md` | AI Property Research & Plat Drawing — 15-phase implementation plan |
| `IMPROVEMENT_ROADMAP.md` | Platform improvement phases 1-8 (phases 1-7 complete) |
| `STYLE_GUIDE.md` | Brand colors, typography, components, responsive breakpoints |
| `STARR_CAD_PHASE_ROADMAP.md` | STARR CAD — 7-phase development roadmap |
| `STARR_CAD_PHASE_1_ENGINE_CORE.md` | STARR CAD Phase 1 — CAD engine core specification |
| `STARR_CAD_IMPLEMENTATION.md` | STARR CAD — Complete master implementation specification |

---

## Database Seeds

All database content is managed through numbered seed files in `seeds/`:

| File | Purpose |
|------|---------|
| `000_reset.sql` | Truncate all data tables for clean re-seed |
| `001_config.sql` | System configuration, XP settings |
| `010_curriculum.sql` | Core curriculum modules and lessons |
| `011_curriculum_blocks.sql` | Welcome lesson block content |
| `020_acc.sql` | ACC course modules, lessons, quizzes |
| `021_acc_blocks.sql` | ACC lesson block content (475 blocks) |
| `030_fs_prep.sql` | FS exam prep question bank |
| `040_drone.sql` | Drone surveying module |
| `050_srvy.sql` | SRVY 2339-2344 course content |
| `060_articles.sql` | Knowledge base articles |
| `070_templates.sql` | Block and problem templates |
| `080_milestones.sql` | XP milestones and rewards |
| `090_research_tables.sql` | AI research module tables and seed data |
| `run_all.sh` | Runner script: `./seeds/run_all.sh --reset` |

---

## Environment Variables

Required environment variables (set in `.env.local`):

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# NextAuth
NEXTAUTH_URL=
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Anthropic (AI)
ANTHROPIC_API_KEY=

# Email
MAILGUN_API_KEY=
MAILGUN_DOMAIN=

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

---

*Starr Surveying Company — Belton, Texas*
