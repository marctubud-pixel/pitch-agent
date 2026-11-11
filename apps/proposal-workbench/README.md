> **真实接入进度，2026-10-31**：原版页面和四服务边界已恢复，来源登记与冻结调研输入已接入。隔离类型检查、67项单元、50项演示E2E及六固定状态像素差0通过；原弹窗保存并刷新恢复亦通过。论点写入/关联、完整核验交接、后续Proposal链路和真实三套PPT仍未完成。未访问真实项目、重启现有服务或调用付费服务。下面原有说明描述演示模式。

# Proposal Workbench (frontend prototype, demo mode)

A creative proposal workspace for advertising and design teams. It takes a client brief to a client-presentable, **editable PowerPoint proposal** for key-visual / poster campaigns and packaging projects, in eight stages:

1. Brief & task → 2. Research → 3. Strategy → 4. Copy & themes → 5. Visual development → 6. Content review → 7. Layout → 8. Final review & delivery

Evidence verification, research readiness, handoffs and release are **internal quality checks** inside these stages, not stages of their own. They stay fully enforced, but they live in a secondary *Reviews & checks* panel and in *Process & history* rather than leading the interface.

It runs entirely in the browser on mock services with simulated data. No backend, network access or credentials are needed.

## Start

```bash
npm install
npm run dev          # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run build:single` | One self-contained `dist-single/index.html` (fonts and images inlined; works offline from `file://`) |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests for the mock service rules (Vitest) |
| `npm run test:e2e` | Browser checks of the main flows (Playwright; run `npx playwright install chromium` once). Add `-- --shots=./shots` to save screenshots |

Requires Node 22.12 or later.

## What is real and what is prototype

Every screen says which it is, with a small label: **Working** (real logic in this build), **Prototype** (demonstrates the intended product with scripted demo content) or **Not built yet**. *What's real here?* in each project header explains the three.

| Working in this build | Prototype (scripted demo content) | Not built yet |
| --- | --- | --- |
| Brief intake: PDF/DOCX/TXT text extraction, the task card with provenance, versions, change review and confirmation | Strategy, copy & themes, visual development, content review, layout and final review content | Real agent or model execution |
| Evidence verification, sufficiency (readiness), handoff and release rules, jobs, recovery, idempotent commands, revision conflicts, stale marking | Agents, scores, adversarial challenges, checkpoint progression (`MockProposalService` advances on a timer) | Image generation and image search |
| The editable **.pptx export**, built in the browser from the deck you see (native text, shapes and charts; artwork as replaceable pictures) | WorkBot answers (`MockAssistantService`, a fixed set of question types) | Accounts, permissions, deployment |

All artwork is generated SVG illustration for the demo, not real campaign imagery. Simulated reviews and agent work are labelled as simulated and are never described as real model execution. Demo scenarios and **Reset demo data** live only in the development area (`/dev`, reached from the *Demo mode* pill).

## Information architecture

- **Proposals** (home), a filing cabinet: the proposal that most needs you lies open, with its work fanned out on top (next step, latest deck or visual, stage of eight, directions or task card) and the project on the front flap. The others wait in the drawer as coloured folders showing their stage and next step; pulling one out swaps it into place (a view transition where supported). Drawer labels filter by *needs you*, KV / poster and packaging.
- Inside a project, five areas:
  - **Overview**: the current stage, the next action, the latest output, the stage rail, what needs you, what is in progress and your recent decisions.
  - **Proposal**: the eight-stage workspace. Each stage shows its work first (task card, research board, strategy, directions, branches, narrative, slide styles, rendered deck), with checkpoints, your ideas and a short review line. Scores, challenges and checks are one click away, not in the way.
  - **Library**: brief materials, case groups, sources, images and reports.
  - **Process & history**: agents (director, leads, specialists, independent evaluators, adversaries), scores and reviews, handoffs, your decisions, tasks and receipts, versions and documents.
  - **Delivery**: the current deck, editable .pptx downloads per style, what stays editable, and remaining limitations. Process records are never part of the client deck.
- **WorkBot** is an assistant beside the work, not the navigation.

Older links (`/p/<id>/brief`, `/research`, `/handoff`, `/sources`, `/images`, `/jobs`, `/artifacts`) redirect into this structure.

### Working modes and checkpoints

A proposal runs in **Automatic** mode (agents produce, review and hand over within the brief) or **Assisted** mode with checkpoints you choose (strategy, copy & themes, visual development, content review, final delivery). At a checkpoint nothing continues until a person decides: *Approve and continue*, or *Ask for a revision* with a comment. Silence is never approval, and WorkBot cannot decide. Choosing a direction against reviewer advice is recorded as *chosen despite review*, separately from *passed review*. A preference never turns an unsupported fact into evidence: research stays unreleased until the working evidence checks pass.

## What to try

- **Northline Outdoor — autumn–winter KV** (KV, assisted) is complete and waiting for delivery sign-off. Walk the eight stages from the rail, switch layout styles, and download the editable .pptx from **Delivery**.
- **Plumtide — can and gift sleeve** (packaging, assisted) waits at the visual-development checkpoint. Approve it with a comment: the simulated agents run content review and layout and stop at the delivery checkpoint. The decision appears in the overview and in *Process & history*.
- **Luma Social Spirits — can redesign** (packaging) is held at research by the real checks. Open *Reviews & checks* to see the exact findings; attach sources, run verification and readiness, record the handoffs and release, and strategy can begin.
- **Morrow Home** has a brief, research and strategy in the working layer but no proposal workspace: opening it offers *Set up the proposal workspace*. Its research history is read-only.
- **New proposal** opens brief intake: upload a PDF, Word (.docx) or text file, paste text, type a request, or try a sample, then review an editable task card. You also choose the project type and working mode.
- In the development area (`/dev`): scenarios (Normal, Empty, Loading, Network error, Revision conflict), a "drop the next save response" toggle, and **Reset demo data**.

All changes persist in localStorage, so a refresh keeps them. Reset restores the seed and clears WorkBot conversations.

## Brief intake

Reading the material and filling in the task card are two separate service operations (`BriefIntakeService.extractText` and `mapToTaskCard`, in `src/domain/intake.ts`). Neither one saves, confirms or spends anything.

- **Extraction is real and runs locally.** Plain text is decoded, including UTF-8 and UTF-16 byte-order marks. DOCX is unzipped and `word/document.xml` is read. PDF text comes from pdf.js, which is loaded only when needed. Scanned PDFs, password-protected files, legacy `.doc` files, empty files, unsupported types and files over 10 MB each get their own error message, and every failure offers *Paste the text instead*.
- **Mapping is honest about what it is.** The demo has no model that can interpret a brief, so there are three outcomes:
  - **Bundled sample, unmodified:** a hand-written mapping, labelled *Simulated extraction*. It has suggestions, unclear fields (for example, timings that conflict) and missing fields (no budget).
  - **Any other material with headings** such as "Budget:" or "Who it is for": the text under each heading is copied word for word, with the passage linked.
  - **Anything else:** every field stays empty and is marked *not looked for*. You fill the card from the extracted text, which is shown beside it.
- **Every field shows where its value came from:** From the brief, Suggestion, Unclear, Missing, Accepted or Edited. Quote chips highlight the source passage. Suggestions block confirmation until a person accepts or changes them. Only the fields research needs (background, audience, objective, deliverables) are required to confirm, and nothing is required to create the project except a name.
- **The original material** is kept with the brief version. Its extracted text is saved. The file itself is kept in memory only, so it can be opened or downloaded until the page is reloaded; after that the brief page says it is no longer available and offers the text instead.
- **Changing a confirmed brief** (by typing or with *Update brief*) always goes through a change review. It shows each field before and after, says that the current version is kept, lists the documents that will go out of date, and applies only when you confirm.

## WorkBot

WorkBot is a conversational assistant. Its character is a chartreuse file folder with glasses, drawn as an SVG (`src/workbot/Character.tsx`) with separate groups for the folder, glasses, eye whites, pupils, arms and feet.

- **Launcher:** the character with an "Ask WorkBot" speech bubble, as one button. The bubble also reports state in words ("WorkBot is answering…", "WorkBot has an answer", "WorkBot couldn't answer").
- **Panel:** on wide screens it sits beside the workspace without covering it; on phones it is a full-height drawer. Escape or the close button closes it and returns focus to the launcher. Closing does not cancel a request in progress, and messages stay until you start a new conversation.
- **Scope:** shown as a choice between the open project, *General* and, while reviewing an unsaved brief, *This draft*. A different project means a different conversation, and a visible notice says when the scope changes.
- **Answers:** assembled from the current records through the public `WorkbenchService` interface when you ask. They are split into *On record*, *Interpretation*, *Suggestion*, *Missing or unclear* and *General guidance*, with chips that open the referenced record. Each answer says which project revision and brief version it used, and is flagged with *Ask again* once the project changes.
- **It only reads.** It cannot change data, confirm briefs, approve checkpoints or pass checks. Asked what to do next, it explains which stage is waiting and says the decision is yours.
- **References open beside it.** When a reference opens the *Reviews & checks* panel, the panel sits between the workspace and WorkBot (non-modal) instead of covering the conversation.
- **Expressions follow the request lifecycle:**
  - idle: an occasional blink;
  - hover or focus: a slight tilt;
  - opening: a short wave;
  - waiting: pupils moving, plus a text indicator, and only while a request is in flight;
  - answer received: a small nod;
  - error: lowered eyes with an error message and *Try again*.
- **Reduced motion:** each state has a still pose instead, and no state is shown by motion or colour alone.
- **Simulated:** in the demo, `MockAssistantService` matches a set of question types (blockers, next steps, brief, evidence, revisions, pitching, history, progress, plus general guidance) in every interface language. It labels every answer *Simulated answer* and explains what it can do when it does not recognise a question.

## Service boundaries

| Interface | Demo implementation | Replace with |
| --- | --- | --- |
| `WorkbenchService` (`src/domain/service.ts`) | `MockWorkbenchService` | `HttpWorkbenchService` |
| `BriefIntakeService` (`src/domain/intake.ts`) | `LocalIntakeService`: local extraction plus simulated or heading mapping | `HttpIntakeService` (for example, extract on upload and map with a model) |
| `AssistantService` (`src/domain/assistant.ts`) | `MockAssistantService` | `HttpAssistantService` (currently reports *not connected*) |
| `ProposalService` (`src/domain/proposal.ts`) | `MockProposalService`: the eight stages, modes, checkpoints, decisions, contributions, agents, reviews and versions, with scripted fixtures | A proposal/orchestration backend |

`MockProposalService` sits **on top of** the Workbench: brief and research stage status are read from it (brief confirmed? research released?), never set independently, so the evidence, versioning and human-decision protections cannot be bypassed by the creative layer. It also follows the same demo scenario (loading, network error, empty).

`src/services/index.ts` (`createServices`) is the only place that picks implementations. Components reach them through `useService`, `useIntake`, `useAssistant` and the proposal hooks in `src/app/proposalQuery.ts`, and never import fixtures, parsers, storage or answer logic.

## Architecture

```
src/
  domain/
    models.ts            Frontend contract: entities, view models, command inputs
    service.ts           WorkbenchService interface, ServiceError kinds
  services/
    index.ts             Chooses the service (mock unless VITE_WORKBENCH_API_URL is set)
    demo.ts              Demo-only controls (scenarios, reset), outside the service contract
    mock/
      MockWorkbenchService.ts   Persistence, latency, scenarios, idempotency, revisions, job simulation
      rules.ts           Deterministic business rules: verification, readiness, eligibility, stages
      simulation.ts      State changes shared by the service and the seed (reviews, versions, stale)
      fixtures/          Seed data for the three projects and bundled placeholder illustrations
    http/
      HttpWorkbenchService.ts   Adapter stub for the real backend, with HTTP→ServiceError mapping
      mappers.ts         Backend payload → frontend model mappers (to be filled in)
    proposal/
      MockProposalService.ts    Stages, modes, checkpoints, decisions, simulated agent progression
      fixtures/          Northline (KV), Plumtide and Luma (packaging) proposal content
  proposal/              Stage UI parts: slides, deck viewer, drawer, scores, evidence chips, .pptx export
  app/                   Router, read hook, command hook, proposal hooks, conflict dialog, toasts, confirmations
  ui/                    Presentational primitives (status badges, actions with reasons, inspector)
  intake/                Task-card state, source picker, task-card editor, change review
  workbot/               WorkBot character, panel and context
  views/                 Home, new project, developer area, project shell
    project/             Overview, Proposal, Library, Process & history, Delivery areas
    stages/              The eight stage screens
```

Rules the code follows:

- Components get data only through `useServiceQuery` and run changes only through `useCommand`. They never import fixtures, touch localStorage or call the network.
- **Commands** carry a `commandId` and an `expectedRevision`.
  - `useCommand` generates a new ID for each new action.
  - After an uncertain failure (network error, lost response), it reuses the same ID, payload and expected revision. The service then returns the stored result instead of applying the change twice.
  - A stale revision is rejected. The shared conflict dialog explains what changed and offers to reload, without discarding edits on screen.
- **Job status and artifact status are separate.** A verification job can succeed while the research it reviewed stays blocked.
- **Verification, readiness, handoff and release are four separate checks.** Continuation eligibility lists each one.
- **Feature availability** (`getCapabilities`) is shown separately from **project eligibility**.
- **Three interface colours.** International Klein Blue (#002FA7) is the dominant colour and carries meaning: the current stage, the active tab, primary actions and data. Warm near-neutral greys form the paper, and one orange accent is reserved for what needs a person (decisions, warnings, problems). Everything is defined in `src/styles/palette.css`; `src/styles/refine.css` holds the distillation layer (type scale `--t-*`, one saturated block per view, hairlines instead of nested boxes) and the fixes from three colour and three layout review rounds. Proposal content keeps its own colours: posters, packs, direction marks and the three slide styles.
- **Whole pieces at their own ratio.** Posters (9:16, 3:4, 4:3, 16:9), packs and mockups are never squeezed or cropped; where a layout imposes another shape they sit whole on a mat (`ArtFrame.tsx`), on screen and in the PowerPoint export. Scenes used as backgrounds may be cropped to fill. Galleries (Overview, Library) are justified rows sized from each piece's ratio. Placement mockups are folded by default.
- **One "needs you" count.** `src/proposal/needs.ts` defines what still needs a person (unconfirmed task card, decisions, revisions, open facts); Home, the Overview tab badge and the Overview list all use it.
- **WorkBot idles.** Between requests it looks around, waves and fidgets on a gentle schedule; the "Ask WorkBot" bubble comes out with some gestures and goes again. Reduced motion keeps it still and shows the bubble once.
- **Styles built from your references.** Every proposal stage, the project header and stage spines, and the Overview tiles are composed from the supplied references; each component's header comment says which reference each composition comes from (`src/views/project/*`, `src/views/stages/*`, styles in `bento.css` and `stages.css`). The three slide styles are each rebuilt from one supplied deck and name it on the Layout stage: *Editorial* ← the case-study grid, *Cobalt & lime* ← the blue corporate deck, *Studio* ← the marketing deck (`src/proposal/Slide.tsx`, `cobalt.css`, `slides.css`). Their PowerPoint export (`src/proposal/pptx.ts`) mirrors the same layouts with editable text and shapes. The Library, Process & history and Delivery tabs share a header of big-number tiles and folder-style tabs (`AreaHead.tsx`, `areas.css`).
- **The .pptx export** (`src/proposal/pptx.ts`, pptxgenjs, loaded on demand) writes every headline, caption, rule, colour field and chart as native PowerPoint objects; generated artwork is rasterised to PNG in the browser and placed as replaceable pictures. Speaker notes carry each slide's notes.

## Languages

The interface is available in English, Français, Español, 日本語, 한국어 and 简体中文. Use the language picker in the top bar. The first visit follows the browser language, and the choice is remembered per browser (`src/app/prefs.ts`).

- **Interface text** lives in `src/i18n/messages/<locale>.ts`. Each catalogue is typed against `en.ts`, so a missing or extra key fails the type check. Plurals use `key_one` / `key_other` (Intl.PluralRules). Dates, relative times, numbers and lists use `Intl`.
- **Service-generated text** (findings, readiness gaps, eligibility checks, next steps, blockers, job labels, errors) is localised by the service, as a real backend would be. The UI calls `service.setLocale()`. The HTTP adapter sends it as `Accept-Language`. The mock stores this text as language-neutral message tokens and renders them in the active language (`src/services/mock/i18n.ts`, `src/services/mock/messages/`), so earlier records also switch language.
- **Not translated:** content written by people or seeded as demo research (project names, briefs, claims, excerpts, notes), the activity log, and simulated provider error details.
- **To add a language:** copy both `en.ts` catalogues, translate them, then register the locale in `LOCALES` (`src/i18n/index.tsx`) and `CATALOGS` (`src/services/mock/i18n.ts`).

## Connecting the real backend

1. Implement `src/services/http/HttpWorkbenchService.ts`. Replace each `notConnected(...)` with a call to the protected `request()` helper, then map the response through `src/services/http/mappers.ts`. Put the backend DTO types in a new `src/services/http/dto.ts`.
2. Align the command metadata with the backend. The adapter currently sends `Idempotency-Key` and `If-Match` headers as placeholders. Status codes map onto the error kinds the UI already handles: 409/412 → conflict, 404 → not found, 422 → validation, 403 → not eligible, 5xx/network → retryable.
3. If the backend returns raw entities rather than view models (`ProjectOverview`, `HandoffOverview`, …), compose them in the adapter. Prefer backend-computed eligibility and stage state over porting `mock/rules.ts`.
4. Wire `subscribe()` to server events or polling so views refresh when jobs progress.
5. Set `VITE_WORKBENCH_API_URL` (for example in `.env.local`). `src/services/index.ts` then uses the HTTP adapter, and the demo pill and controls disappear automatically.

## Limitations

- Everything after research (strategy to delivery) is scripted demo content advanced by a timer. No agent, model, image search or image generation runs. New projects reach research and then show what the stage will contain once built.
- All research, reviews, observations, receipts and strategy drafts are simulated and deterministic. Image observations of uploads are built from file metadata (size, orientation, sampled colours), not visual analysis.
- Packaging views and mockups are conceptual illustrations, not production-engineered dielines.
- Owner sign-offs and checkpoint decisions are recorded by the demo user. There are no accounts or permissions.
- Proposal content (directions, copy, findings) is demo text in English; the interface around it is translated.
- Uploaded images live in localStorage, which is limited to a few megabytes. The app warns when storage is full.
- Relative times ("3 h ago") do not tick while a page stays open.
- Brief field mapping is not real interpretation (see *Brief intake*). Uploaded originals are not kept after a reload.
- WorkBot recognises a fixed set of question types. It is not a language model.
- The .pptx download saves directly in a normal browser tab. Inside the claude.ai artifact viewer it goes through the viewer's download prompt (the page declares the `downloads` capability); other embedded previews that block downloads cannot save it.
