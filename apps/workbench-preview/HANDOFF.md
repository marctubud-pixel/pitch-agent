# Handoff: connect Proposal Workbench to the real backend

You are receiving a **finished frontend prototype** (React 19, TypeScript, Vite) with demo data. Your job is to connect it to the real backend **without changing how it looks or behaves**. The look was designed and reviewed carefully; it is documented so you can reproduce and protect it.

## Read in this order

1. **`docs/DESIGN-SPEC.md`**: the visual and layout reference: principles, colour tokens, type scale, layout, components and every screen, with screenshots. This is what "looks right" means.
2. **`docs/SCREENSHOTS.md`** and **`docs/screenshots/`**: the baseline pictures (desktop light, desktop dark, phone). Open the ones for the screens you touch before you change anything.
3. **`docs/BACKEND-INTEGRATION.md`**: the service interfaces, what to implement, rules to keep, and the definition of done.
4. **`README.md`**: how to run it, architecture, what is real versus prototype.

## Quick start

```bash
npm install
npm run dev                 # demo mode, hash routes (#/ , #/p/northline , …)
npx tsc --noEmit
npx vitest run              # 46 unit tests
node scripts/e2e.mjs        # 50 browser checks (uses the demo services)
node scripts/shots.mjs docs/screenshots-new   # recapture screens to compare with the baseline
```

Demo projects to open: `#/p/northline` (finished, waiting for a decision at stage 8), `#/p/plumtide` (waiting at stage 5), `#/p/luma` (blocked on research evidence).

## Prompt to give the agent

> You have the source of "Proposal Workbench" (see HANDOFF.md). Connect it to our backend: **<base URL, auth, API docs / OpenAPI link, test environment>**.
>
> First read `docs/DESIGN-SPEC.md`, look at the screenshots in `docs/screenshots/` for every screen you will touch, and then `docs/BACKEND-INTEGRATION.md`. The interface must look and behave exactly as in the screenshots after the backend is connected. Do not redesign, restyle, swap components, recolour, or change type sizes, spacing or copy. If real data breaks a layout, fix it inside the rules in the spec.
>
> Work in this order, keeping tsc, vitest and e2e green after each step: (1) `WorkbenchService` (projects, brief, research); (2) intake; (3) assistant; (4) `ProposalService` for the creative stages, only for the parts the backend provides. Everything the backend does not provide must stay clearly labelled as prototype or not connected, never presented as real.
>
> Keep these rules: do not describe simulated image observations, reviews or demo transitions as actual model execution; demo controls and reset tools stay in the development-only area; preserve the backend's evidence, versioning and human-decision protections and never weaken them to make a screen look complete; a human preference cannot turn unsupported facts into verified evidence; test mutations on isolated demo data and never touch real projects or trigger paid services; simulated professional or user perspectives are never described as real customer approval or consumer research.
>
> Finish by running `node scripts/shots.mjs docs/screenshots-new`, comparing against `docs/screenshots/` and reporting any visual difference you could not avoid, plus a list of which screens now use real data and which are still demo.

## What is real and what is not (so you do not trip over it)

- **Real today:** the interface, six languages, light/dark/system colour mode, local brief text extraction, the editable `.pptx` export, and the rule logic that keeps stage status derived from the workbench (brief confirmed? research released?).
- **Simulated/scripted:** all research results, reviews, scores, image observations, strategy through delivery content, WorkBot answers, and the stage progression timer. Nothing there is produced by an agent or model yet; the backend must supply it.
- The demo user records owner sign-offs; there are no accounts or permissions yet.
