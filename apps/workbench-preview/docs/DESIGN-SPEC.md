> 当前采用[中文桌面规格](DESKTOP-CN.md)。本文的多语言、手机模式及旧截图仅作历史参考。

# Design spec: Proposal Workbench

This document describes the November 3 baseline. **For the accepted November 8 experience edition, [EXPERIENCE-20261108.md](./EXPERIENCE-20261108.md) takes precedence for reading order, compact typography, visual navigation and mobile WorkBot.** The older screenshot rules below remain historical references for unchanged components.

This is the visual and layout reference for the baseline interface. **The screenshots in `docs/screenshots/` are the source of truth for how it must look.** This document explains them: what each part is, why it is shaped that way, and which values to use. When the text and a screenshot seem to disagree, the screenshot (and the CSS it was captured from) wins.

Do not redesign, "modernise" or substitute another component library. Connecting a backend must not change how any screen looks. If real data makes a layout break (longer text, missing images, empty lists), fix it **inside** the rules below.

- Screenshot index: [SCREENSHOTS.md](./SCREENSHOTS.md)
- Re-capture and compare after your changes: `node scripts/shots.mjs docs/screenshots-new`, then compare the two folders (see "Verifying you kept the look" at the end).
- All screenshots use the **demo data** (three fictional clients). Wording and images in them are demo content, not requirements.

---

## 1. What the product is, in one paragraph

A workspace for building a creative proposal (key visual / poster / packaging) in **eight stages**: Brief & task → Research → Strategy → Copy & themes → Visual development → Content review → Layout → Final review & delivery. A person works with a team of agents; at chosen checkpoints the agents stop and wait for a human decision. The final output is an **editable PowerPoint** plus the creative directions. The interface is calm, editorial and honest about what is real and what is simulated.

## 2. Design principles (the reasoning behind every screen)

These came out of several review rounds. Keep them when you add or change anything.

1. **Three colours only.** Klein blue is dominant. Warm neutrals carry everything else. One orange accent is reserved for *what needs a person* (a decision, a warning, a problem). Nothing else may be orange. Finished things are never orange.
2. **One saturated block per view, at most.** On the Overview it is the blue progress band. On a stage it is the blue stage tab. Everything else is white, grey or hairline.
3. **Hairlines instead of boxes inside boxes.** Inside a card, group with thin rules and spacing, not with nested bordered boxes.
4. **One big headline per view.** Everything else steps down a fixed type scale (section 4). Never invent a new size.
5. **Say each thing once.** Stages are shown once on a page, statuses are not repeated as pills and text, no duplicate section links.
6. **Whole pieces, true ratios.** Posters, packs and mockups are always shown complete at their own aspect ratio on a mat (`ArtFrame`), never cropped or stretched to fit a card. Mockups fold away until opened.
7. **Honesty is quiet but always present.** Every claim carries a small label: WORKING (backed by the real workbench) or PROTOTYPE (scripted/demo). They are small grey text, not badges. Simulated reviews are never described as real customer or consumer approval.
8. **One count of "needs you".** Home, the Overview and the tab badge all use the same function (`src/proposal/needs.ts`, `needsYou`). Do not recompute it elsewhere.
9. **Proposal content has its own colours.** Posters, packs, the A/B/C direction marks and the three slide styles are the *work being made*, not the interface. The three-colour rule does not apply to them. Do not recolour them.

## 3. Colour

All interface colour is defined in one file: `src/styles/palette.css`. Components use the semantic tokens (`--paper`, `--surface`, `--ink`, `--accent`, `--warn` …), which are mapped from the raw scales below. Use tokens, never hard-coded hex values, in interface CSS.

### 3.1 Klein blue scale (both modes)

| Token | Value | Use |
|---|---|---|
| `--klein` / `--b-700` | `#002fa7` | International Klein Blue. Solid fills, primary buttons, current stage, links |
| `--b-950` | `#000c2e` | Text on pale blue (dark ink) |
| `--b-900` / `--b-800` | `#001352` / `#001f80` | Deep tiles |
| `--b-600` | `#0a38b8` | Info, focus ring (light) |
| `--b-500` | `#1f4fd6` | Mid blue |
| `--b-400` / `--b-300` | `#5c7fe8` / `#9cb2f3` | Accent and links on dark ground |
| `--b-200` / `--b-100` / `--b-50` | `#c8d5f9` / `#e4ebfd` / `#f3f6fe` | Tints: folders, washes, selected rows |
| `--b-850` / `--b-875` / `--b-925` | `#0b1a52` / `#08143d` / `#070b1c` | Deep grounds for dark mode, same hue |

### 3.2 Neutrals

| Token | Light | Dark |
|---|---|---|
| `--n-paper` (page) | `#f1f1ee` | `#0b0b0a` |
| `--n-card` (surface) | `#ffffff` | `#151513` |
| `--n-sunken` | `#f6f6f3` | `#1c1c1a` |
| `--n-ink` (text) | `#101114` | `#ededea` |
| `--n-ink-2` | `#45464d` | `#b8b8b2` |
| `--n-ink-3` | `#64656c` | `#9c9c96` |
| `--n-rule` (hairline) | `#e3e3df` | `#282826` |
| `--n-rule-strong` | `#c4c4bf` | `#3f3f3c` |

### 3.3 Orange accent (needs a person)

| Token | Value | Use |
|---|---|---|
| `--o-500` | `#ff7a1f` | Fills: the waiting stage on the blue band, "Go to it" button |
| `--o-600` / `--o-700` | `#c75000` / `#ad4300` | Orange **text** on light ground (`3 need you`, warnings) |
| `--o-800` | `#8f3300` | Problems |
| `--o-100` | `#ffe8d6` | Wash behind a waiting stage or warning |
| `--o-300` / `--o-400` | `#f6a56c` / `#f2924f` | Orange text and fill on dark ground |
| `--o-900` / `--o-950` | `#3a2213` / `#3d1f10` | Washes on dark ground |

### 3.4 Semantic mapping

`--accent` = `--b-700` (light) / `--b-300` (dark). `--ok` = blue (done and in progress are blue). `--warn` = orange 700 / 300. `--bad` = orange 800 / 200. `--focus` = `--b-600` (light) / `--b-300` (dark); on Klein-blue fills the focus ring is white. Status rule: **done and in progress are blue; anything that needs you is orange; nothing is green or red.**

### 3.5 Dark mode

Dark mode is a full second theme, not an inversion: near-black warm paper `#0b0b0a`, cards `#151513`, the same Klein blue for solid blocks (it is dark enough to hold), lighter blue tints (`--b-300`) for text and links, and orange shifted lighter. The mode follows the system by default; a three-way switch in the top bar (Follow system / Light / Dark) pins it. Preference key: `localStorage['pw.theme']`; the attribute is `data-theme="light|dark"` on `<html>`, absent for "follow system".

**CSS rule you must keep:** every dark rule exists in two forms so that both the system preference and the manual switch work: inside `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) … }` and again as `:root[data-theme='dark'] …`. Do not use `:is()` around dark selectors: it takes the specificity of its strongest member and made dark rules outrank later light rules (a real bug we fixed).

## 4. Typography

| Role | Family | Notes |
|---|---|---|
| UI and headings (`--font-ui`, `--font-display`) | **Instrument Sans** (variable) | falls back to IBM Plex Sans, then system-ui |
| Reading text (`--font-reading`) | **Newsreader** | Narrative passages on Content review; serif lines in posters |
| Code/mono (`--font-mono`) | IBM Plex Mono | |
| CJK | system fonts (Hiragino, Noto, PingFang…) via `--font-cjk` | CJK text gets `letter-spacing: 0` and strict line breaking |

Fonts are bundled from `@fontsource*` packages (no external requests).

### Type scale (`src/styles/refine.css`, top)

| Token | Size | Where |
|---|---|---|
| `--t-display` | `clamp(2.25rem, 4.4vw, 3.5rem)` | The home headline ("3 proposals in motion, 3 need you") |
| `--t-h1` | `clamp(1.875rem, 3.2vw, 2.625rem)` | One per view: the Overview problem statement, the stage title, the project title in folders |
| `--t-h2` | `clamp(1.375rem, 2vw, 1.75rem)` | Section headings, big numbers ("2 still needs your confirmation", the current stage name on the blue band) |
| `--t-h3` | `1.125rem` | Card titles |
| `--t-body` | `0.9375rem` | Body |
| `--t-small` | `0.8125rem` | Secondary text, meta lines |
| `--t-label` | `0.6875rem` | Uppercase labels/eyebrows (letter-spaced) |

Rules: headings use tight tracking; labels are uppercase with wide tracking; do not add sizes between these.

## 5. Layout

- **Top bar:** sticky, 56px, paper background, 1px bottom rule. Left: logo mark + "Proposal Workbench". Right: language pill, colour-mode switch (3 icon buttons in a pill), then the "Demo mode · Simulated data" pill. On phones the language pill shows only its icon and the demo pill wraps onto two lines (it must never be cut off).
- **Page column:** centred, `max-width: 1040px` for ordinary pages and 1120px for wide ones, with side gutters. Project pages sit in this column; the home page is wider (see the screenshot).
- **Project header (all project pages):** back link "All proposals", client chip (small blue-tint pill, uppercase), project title (h1 size), mode pill ("Assisted · 2 checkpoints") and "What's real here?" link on the right, then the tab bar: **Overview · Proposal · Library · Process & history · Delivery**. The active tab is a solid Klein pill; the Overview tab carries a small orange count badge when something needs you. On narrow screens the tab bar scrolls horizontally with an edge fade.
- **Cards:** white surface, large radius (12px base, 20–28px on big tiles), very soft shadow, no heavy borders.
- **Grid:** 12-ish column feel built with CSS grid and `auto-fit` minimum widths, so rows collapse gracefully; cards in a row align on a common top edge and bottom edge where possible.
- **WorkBot:** fixed to the bottom-right corner (a small folder-shaped character with glasses). It is a fixed element, so in the full-page screenshots it appears wherever the capture happened to place it; that is an artefact, not a layout.

### Responsive

Breakpoints are at 1180, 1100, 640 px and narrower. At phone width (390px reference, screenshots in `phone-light/`): single column, the 8-stage band becomes a 2-column grid of tiles, tab bar scrolls, nothing may scroll horizontally. `node scripts/e2e.mjs` checks for horizontal overflow on key views at 375px in every language.

## 6. Core components

| Component | Where in code | Look |
|---|---|---|
| Stage rail (vertical folder tabs) | `src/views/project/ProposalArea.tsx`, `proposal.css` | Eight tall tabs with rotated titles on every stage page. Current = solid Klein; done = pale blue with a check ring; waiting = pale orange with an orange hand ring; a black dot marks the checkpoint. The left card beside it is the stage header: eyebrow "STAGE 3 OF 8 · STRATEGY LEAD", h1 title, one-line purpose, status chip, working/prototype label, summary line and date. |
| Progress band (Overview) | `OverviewArea.tsx`, `refine.css` (`.ov-progress`, `.ov-track`) | The only saturated block on the page: Klein, with the current stage name at h2 size, two stat tiles (stages done, review average) and eight stage tiles; the waiting stage is orange. |
| "Needs your confirmation" tile | `OverviewArea.tsx` (`.ov-confirm`) | White tile, big orange count on the left; right side lists what needs a decision, then a "Next action" row with a circular blue arrow button. |
| Cabinet (home) | `HomeView.tsx`, `dashboard.css`, `archive.css` | One proposal lies open as a folder (blue back with a tab showing the client); the others sit in a drawer on the right as stacked tinted folders with filter chips and search. View transitions animate pulling a folder out. |
| ArtFrame | `src/ui/art/ArtFrame.tsx`, `frames.css` | Presents a poster/pack/mockup complete on a pale mat at its own ratio (9:16, 3:4, 16:9, 4:3). Never crop. A short row of posters leaves empty space on the right; this is intended. |
| Mockups fold | Visual stage | "Mockups · 2" row with a thumbnail strip and a Show/Hide button; folded by default (`aria-expanded=false`). |
| Score bars | `ReviewRows.tsx`, Themes/Visual | Label, Klein bar on a pale track, number at right; scores below threshold use the pale blue, never orange. |
| Checkpoint card | stage pages | When a stage waits, a bordered orange card: "This stage is waiting for your decision"; a hairline-separated block saying what is decided (the whole stage, with its stage version) and, on Visual development, which direction and artwork version wait for review, recorded changes and open issues, and a "View the pending work" button; an optional comment field; **Approve {stage} and continue** (solid blue) and **Ask for a revision** (quiet, disabled until a comment is written). Copy line: "Nothing continues without your decision, and WorkBot cannot decide for you." |
| Idea box | stage pages | Dashed-border panel "Your ideas for this stage" with an Add an idea button. |
| Previous/Next | stage pages | Two small white cards at the bottom corners. |
| WorkBot | `src/workbot/` | Character with idle motions (looks left/right, small hand movements) and an "Ask WorkBot" bubble that appears only occasionally. Chat panel on the right, styled in the same blue/neutral scheme; header is a Klein bar with the SIMULATED label. |
| Slides | `src/proposal/Slide.tsx`, `slides.css`, `pptx.ts` | Three deck styles (Editorial, Cobalt & lime, Studio) rendered in the page with container-query units, exported as a real editable `.pptx` (native text, shapes and charts; artwork as images). |

## 7. Screen by screen

Paths are relative to `docs/screenshots/desktop-light/` (dark: `../desktop-dark/`, phone: `../phone-light/`; same file names).

### 7.1 Home: the cabinet
![Home](screenshots/desktop-light/01-home-cabinet.png)
- Eyebrow date, then the display headline with the **orange** phrase "3 need you" (text only, no pill). Single primary button **New proposal** at top right (only one on the page).
- Left: the open folder for the proposal that needs attention most. Klein back with a tab "NORTHLINE OUTDOOR CO. (FICTIONAL)". Three sheets lean inside: **Next** (near-black card with the next decision and an orange "Go to it" button), **Latest deck** (poster at its true ratio on a mat), **Directions** (A/B/C marks, "Recommended: C"). Below, a white front panel: "2 items need you · 5 days ago" (orange), the project title at h1 size, one-line description, the 8-segment progress bar (the last segment hatched = waiting), meta line, and a black **Open project** button.
- Right: the Archive drawer: count, filter chips (All / Needs you / KV-poster / Packaging), search field, then the other folders stacked with tinted blues, each with client tab, title, a status chip with a dot, and "5/8 · Next: …".
- No dashed "empty folder" placeholder is shown once a folder is open.
- Pulling a folder: ![Pulled](screenshots/desktop-light/02-home-folder-pulled.png)

### 7.2 New proposal (intake)
![New](screenshots/desktop-light/03-new-proposal.png)
Three-step header (Add the brief → Check the task card → Create as a draft). Four input modes as tiles (Upload a file / Paste text / Describe it / Try a sample); the selected tile has a thick dark outline. A dashed Klein drop zone on pale blue. A note states honestly that, in the demo, text is read locally and mapping is simulated.

### 7.3 Overview (the reading order is fixed)
![Overview](screenshots/desktop-light/10-overview-northline.png)
Order, top to bottom, and it must not change:
1. **What this proposal solves**: one h1-size statement, three hairline-separated facts (intended output, use occasion, scope), a "Task card" link, and the hero poster on a mat on the right.
2. **Progress**: the blue band (see components). Stages appear here once only.
3. **Still needs your confirmation**: orange count, the decisions waiting, unknown facts, and the Next action.
4. **Produced so far**: text pieces in a row (research summary, strategic conclusion, directions) then an art row of pieces at true ratios (three visuals + the deck).
5. **Your ideas · Work in progress · Your recent decisions**: three columns.
Other states: [plumtide waiting](screenshots/desktop-light/11-overview-plumtide.png), [luma blocked](screenshots/desktop-light/12-overview-luma-blocked.png). Dark: [dark](screenshots/desktop-dark/10-overview-northline.png). Phone: [phone](screenshots/phone-light/10-overview-northline.png).

### 7.4 Stage 1: Brief & task
![Brief](screenshots/desktop-light/20-stage-brief.png)
Stage header + rail; "The assignment" as a mosaic (title, reference poster, a blue "Intended output" tile, "Use occasion", a tall dark scope tile with an image); four columns (Brand/product, Target audience, Constraints, Open questions) each with an Accepted tag; a big orange **3** "Not known, so not assumed" with the three unknown facts; "Material supplied" cards; "How the work runs" (Automatic vs Assisted radio cards and the checkpoint checkboxes, the chosen checkpoints in orange tint); "Full task card" disclosure.

### 7.5 Stage 2: Research
![Research](screenshots/desktop-light/21-stage-research.png)
A release strip ("Checked and released to strategy" with passed-check chips and "Open reviews & checks"), a big Klein finding statement beside an illustration card, four topic chips, then per-topic sections: finding rows with tags (Supported / Background / Unverified), art cards for cases (dark cards with a corner arrow), and small charts (lead tile in Klein, others pale). Checks drawer: [luma](screenshots/desktop-light/31-research-checks-drawer-luma.png). Blocked state: [luma blocked](screenshots/desktop-light/32-research-blocked-luma.png).

### 7.6 Stage 3: Strategy
![Strategy](screenshots/desktop-light/22-stage-strategy.png)
The question the proposal answers (h1-size, three art cards with a Category/Brand/Audience chip); the intersection diagram (three circles, the centre labelled "The intersection" with the statement in Klein blue); "How we got there" numbered cards with source chips; a near-black Conclusion block with an "Answer to the question" line; three opportunity cards with a coloured top edge and "Leads to …" direction chips.

### 7.7 Stage 4: Copy & themes
![Themes](screenshots/desktop-light/23-stage-themes.png)
Copy-direction line; three direction cards (A pale blue-grey, B ochre, C deep navy, with the recommended one outlined and tagged); "We recommend C · Out before dark" with three reason tiles and the director note; a side-by-side comparison table; evaluation score cards per direction; the idea box with a used idea. A "kept despite review" tag is neutral, not orange.

### 7.8 Stage 5: Visual development
![Visual](screenshots/desktop-light/24-stage-visual.png)
Direction switcher (three cards), four-step strip, then: reference search chips, candidate references fanned as cards (Kept / Not kept), composition sketches with score bars, the refined visual (poster at true ratio) beside its evaluation, the **Mockups** fold (closed by default; [open](screenshots/desktop-light/27-stage-visual-mockups-open.png)), and "Are the directions different enough?" with the three visuals and pairwise comparison rows (⇄ between compared pairs).

### 7.9 Stage 6: Content review
![Content review](screenshots/desktop-light/25-stage-content-review.png)
Seven pass/revised/open questions with tiles (PASS pale blue, REVISED, OPEN), a list of review rows with check/revise icons, then "The narrative": numbered passages in the serif reading face, with struck-through "WAS:" text and an "Edit wording" action.

### 7.10 Stage 7: Layout
![Layout](screenshots/desktop-light/26-stage-layout.png)
Three presentation styles (Editorial, Cobalt & lime, Studio) as large selectable cards with a main sample, two small samples and notes; the chosen one is outlined. Below, the deck viewer (arrow keys, thumbnails, full screen) and a "What stays editable in PowerPoint" panel.

### 7.11 Stage 8: Final review & delivery
![Delivery stage](screenshots/desktop-light/28-stage-delivery.png)
When waiting: the orange checkpoint card; a solid Klein call-to-action strip "Preview the deck and download the editable PowerPoint"; final review tiles and rows; the directions side-by-side table; the recommendation sentence in Klein; "Remaining limitations".

### 7.12 Other areas
[Delivery area](screenshots/desktop-light/40-delivery-area.png) · [Library](screenshots/desktop-light/41-library.png) · [Process & history](screenshots/desktop-light/42-process.png) · [Brief area](screenshots/desktop-light/43-brief-area.png) · [Dev-only area](screenshots/desktop-light/60-dev-area.png)

### 7.13 WorkBot open
![WorkBot](screenshots/desktop-light/50-workbot-open.png)
A right-hand panel: Klein header with the character, "WorkBot", a SIMULATED label, reset and close buttons; scope switch (this project / General); a notice when the scope changed; a welcome card; question suggestions as pale chips; a rounded input with a send button; a footer line saying it explains and links but cannot change data or approve work.

## 8. States you must keep

- Loading, empty, error, conflict and "not available" states exist for each data view (see `src/ui/kit` and the demo scenario switch in the dev area). Keep their layout when real data arrives; do not replace them with spinners that shift the page.
- A stage that waits for a human shows the orange checkpoint card and an orange tile on the rail; approve is only enabled where allowed, "Ask for a revision" needs a comment.
- Demo controls and reset tools are for the development-only area (`/dev`) and must not appear in the live product.

## 9. Motion

Small and purposeful: the view transition when a folder is pulled out on Home; WorkBot's idle life (look around, small hand gestures, an occasional bubble, on a 4–8.5 s cadence); no decorative animation elsewhere. Everything respects `prefers-reduced-motion` (the screenshots are captured with reduced motion).

## 10. Languages

Six interface languages: English, Simplified Chinese, Japanese, Korean, French, Spanish. Text lives in `src/i18n/messages/*.ts`; every key must exist in all six. Demo proposal content (directions, copy) is English only. Layouts must tolerate longer strings (French/Spanish) and CJK line breaking; the e2e script checks every language for overflow.

## 11. Verifying you kept the look

1. `node scripts/shots.mjs docs/screenshots-new` (starts its own dev server with the demo services).
2. Compare `docs/screenshots-new/` with `docs/screenshots/`, file by file, for the three variants (desktop-light, desktop-dark, phone-light). Differences in **text content** are expected once real data is connected; differences in **layout, colour, type size, spacing, component shape** are not.
3. Check the five things reviewers kept catching: (a) only one saturated blue block per view; (b) orange only on things that need a person; (c) posters and mockups whole at true ratio; (d) the Overview order in 7.3; (e) dark mode readable, with no leftover light tiles.
4. Run `npx tsc --noEmit`, `npx vitest run`, `node scripts/e2e.mjs` (50 checks). The e2e run uses the demo services and must keep passing.
