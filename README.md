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
├── public/                      # Static assets, logos, images (≈1 MB after Phase 0.5 cleanup)
├── design-source/               # Source artwork (.xcf, _original* exports) — versioned, never served
├── docs/
│   ├── README.md                # Top-level docs index
│   ├── platform/                # Cross-cutting platform specs (RECON_INVENTORY, CLOSURE_TOLERANCE, …)
│   ├── product/                 # One file per product (Starr Recon, Starr Archive, …)
│   ├── engine/                  # Engine subsystem specs (Texas Road Variant, …)
│   ├── style/                   # Visual design system (STYLE_GUIDE)
│   ├── planning/                # Time-boxed planning docs
│   │   ├── completed/           # Work has shipped — kept for history
│   │   ├── in-progress/         # Live specs and roadmaps
│   │   └── obsolete/            # Pending delete after one PR cycle of grace
│   └── testing-lab/             # Testing-lab user guide and adapters
├── CONTRIBUTING.md              # Where new code goes, how to run tests, naming conventions
└── README.md                    # This file
```

---

## Key Documentation

Start at [`docs/README.md`](docs/README.md) for the full index. Highlights:

| Document | Purpose |
|----------|---------|
| `README.md` | This file — platform overview and quickstart |
| `CONTRIBUTING.md` | Where to put new code, how to run tests, naming conventions |
| `docs/README.md` | Top-level docs index |
| `docs/planning/README.md` | Explains the planning folder rubric (completed / in-progress / obsolete) |
| `docs/platform/RECON_INVENTORY.md` | Single source of truth for the Starr Recon build plan |
| `docs/platform/STARR_SOFTWARE_SUITE.md` | Product family overview and naming |
| `docs/style/STYLE_GUIDE.md` | Brand colors, typography, components, responsive breakpoints |
| `docs/planning/in-progress/PLAN.md` | AI Property Research & Plat Drawing — 15-phase plan |
| `docs/planning/in-progress/IMPROVEMENT_ROADMAP.md` | Platform improvement phases (1-8) |
| `docs/planning/in-progress/STARR_CAD_PHASE_ROADMAP.md` | Starr Forge (CAD) — 7-phase roadmap |
| `docs/planning/in-progress/STARR_CAD/STARR_CAD_PHASE_1_ENGINE_CORE.md` | Starr Forge Phase 1 spec |
| `docs/planning/in-progress/STARR_CAD_IMPLEMENTATION.md` | Starr Forge master implementation spec |
| `docs/product/starr-archive.md` | Starr Archive sketch (filing-cabinet digitization) |

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
