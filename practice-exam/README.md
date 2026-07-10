# FS Practice Exam — Captured Q&A + Figures

Captured **2026-07-10** from the NCEES BenchPrep **Fundamentals of Surveying (FS)** 50-question full-length practice test
(`https://ncees.benchprep.com/app/fs#exams/details/296913`), for building out the Starr Surveying custom prep course.

## Contents

| File | What it is |
|------|-----------|
| `FS-Practice-Exam-QA.md` | Human-readable record of all 50 questions: full stem, options, correct answer, official explanation/solution, Claude's answer, and pass/fail. Includes exam-trap notes. |
| `fs-practice-exam-questions.json` | Structured data for import/generation. One object per question with `type`, `options`, `correct`, `explanation`, `ncees_category`, `topic`, `has_figure`, `figure_file`, `difficulty`, `notes`. |
| `images/` | The 10 figure diagrams as **vector SVGs** (original source files, not screenshots). |

## Score

**Official finalized score: 92% (46/50).** Per-category:

| # | NCEES Category | Score |
|---|----------------|-------|
| 1 | Surveying Processes and Methods | 88% (7/8) |
| 2 | Mapping Processes and Methods | 86% (6/7) |
| 3 | Boundary Law and Real Property Principles | 90% (9/10) |
| 4 | Surveying Principles | 83% (5/6) |
| 5 | Survey Computations and Computer Applications | 100% (9/9) |
| 6 | Business Concepts | 100% (5/5) |
| 7 | Applied Mathematics and Statistics | 100% (5/5) |

Questions answered incorrectly (per in-session feedback): **Q5, Q17, Q30** (all reviewed in the QA doc; Q17 & Q30 are contentious/ambiguous items worth flagging in the course). One additional Category-4 question was scored wrong only in final grading.

## Question types present
- `mc_single` (39) — single-answer multiple choice
- `mc_multi` (2) — "select N that apply"
- `numeric` (4) — numeric entry (some accept a range)
- `drag_order` (3) — put items in sequence
- `drag_label` (1) — drag terms onto a diagram
- `hotspot` (1) — click a location on a figure

## Figures
Figure questions: **6, 7, 9, 13, 19, 20, 28, 36, 37, 46**.
Image source pattern (public): `https://s3.amazonaws.com/wmx-api-production/courses/92292/images/FS_<questionNumber>.svg`.
Saved locally as descriptive SVGs in `images/` (e.g. `Q06_sewer-grade-cut-profile.svg`).

## Notes for question generation
- The `notes` fields flag exam traps (remainder vs proportionate lots, tangent-chord = I/2, NSSDA 1.7308/1.9600, etc.) — good seeds for variant questions.
- SVGs are editable vector art: values/labels can be swapped to generate parameterized variants of the figure questions.
- `ncees_category` is a best-guess mapping; `topic` is the finer descriptive tag.
