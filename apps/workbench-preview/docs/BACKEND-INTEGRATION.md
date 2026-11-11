# Backend integration guide

Goal: connect this frontend to the real backend **without changing how it looks or behaves**. Read `DESIGN-SPEC.md` first so you know what must not change, then use this file for the how.

## 1. The seam

The UI never talks to data directly. Components use four interfaces (defined in `src/domain/`), obtained through hooks. `src/services/index.ts` (`createServices`) is the **only** place that chooses implementations.

| Interface | File | Demo implementation | What you write |
|---|---|---|---|
| `WorkbenchService` | `src/domain/service.ts` | `MockWorkbenchService` (`src/services/mock/`) | Finish `src/services/http/HttpWorkbenchService.ts` (every method currently throws "not connected") |
| `BriefIntakeService` | `src/domain/intake.ts` | `LocalIntakeService` (local text extraction + simulated mapping) | Finish `src/services/http/HttpIntakeService.ts` |
| `AssistantService` | `src/domain/assistant.ts` | `MockAssistantService` (fixed question types, not a model) | Finish `src/services/http/HttpAssistantService.ts` |
| `ProposalService` | `src/domain/proposal.ts` | `MockProposalService` (`src/services/proposal/`) | **Does not exist yet.** Write `HttpProposalService`; see section 4 |

Components must keep going through `useService`, `useIntake`, `useAssistant` and the proposal hooks in `src/app/proposalQuery.ts`. Never import fixtures, parsers, storage or answer logic into a component.

`createServices` already switches on `VITE_WORKBENCH_API_URL`. Today, even when it is set, `proposals` stays on `MockProposalService` ("the creative stages have no backend yet"). Change that line when you have a proposal backend.

## 2. WorkbenchService (projects, brief, research)

Reads: `getCapabilities`, `listProjects`, `getProjectOverview`, `getBriefHistory`, `getResearchWorkspace`, `listSources`, `listImages`, `getHandoffOverview`, `listJobs`, `listArtifacts`, `getArtifact`, `getBriefAttachmentFile`.

Commands (each takes `CommandMeta`: an idempotency key and the expected project revision): `createProject`, `saveBrief`, `confirmBrief`, `addSource`, `linkSourceToClaim`, `addClaim`, `uploadImage`, `requestObservation`, `reviewObservation`, `generateResearch`, `startVerification`, `startReadinessReview`, `recordHandoff`, `releaseResearch`, `continueToStrategy`, `retryJob`, `reconcileJob`.

Also: `subscribe(listener)` (call listeners with `{type:'data-changed', projectId}` when data changes: use server events or polling so job progress shows up) and `setLocale(locale)` (send it as `Accept-Language`; the service generates text such as findings and next steps in that language).

Steps:
1. Put the backend DTO types in `src/services/http/dto.ts`.
2. In `HttpWorkbenchService.ts`, replace each `notConnected(...)` with a call to the protected `request()` helper, then map the response to the existing view models in `src/services/http/mappers.ts`. **Keep the UI view-model types as they are**; adapt in the mapper.
3. Status codes map to the error kinds the UI already handles: 409/412 → conflict, 404 → not found, 422 → validation, 403 → not eligible, 5xx/network → retryable. The adapter sends `Idempotency-Key` and `If-Match` headers as placeholders: align them with your backend.
4. If the backend returns raw entities, compose the view models (`ProjectOverview`, `HandoffOverview`, …) in the adapter. Prefer backend-computed eligibility and stage state over porting `src/services/mock/rules.ts`.
5. Set `VITE_WORKBENCH_API_URL` (for example in `.env.local`). The demo pill and demo controls should then disappear; check this on every screen, including the Overview and `/dev`.

## 3. Intake and assistant

- `BriefIntakeService`: `extractText`, `mapToTaskCard`, `listSamples`, `getSampleFile`. The demo extracts text locally and maps fields only for bundled samples or under clear headings ("Budget:"). A real implementation can extract on upload and map with a model, but the UI must keep showing the person what was mapped and let them correct it before anything is saved. `simulated` must be `false` once real.
- `AssistantService`: `available` is `false` when no backend is connected (the UI then says so; do not fake answers). Real answers must come from the project's records, and the footer promise stays true: WorkBot explains and links, it cannot change data, approve work or confirm the brief.

## 4. ProposalService (the eight creative stages)

The interface is `ProposalService` in `src/domain/proposal.ts`: `listProposals`, `getProposal`, `findByWorkbenchId`, `createProposal`, `setMode`, `decide`, `contribute`, `editNarrative`, `chooseLayout`, `subscribe`, plus a `backing` field (`connected` / `prototype` / `planned`) that says how real the data is.

Important facts:
- **Everything after research (strategy → delivery) is scripted demo content advanced by a timer.** No agent, model, image search or image generation runs. The backend must supply this, or those screens must say they are not connected.
- `MockProposalService` sits on top of the Workbench: brief and research status come from it (brief confirmed? research released?), never set independently. Keep that: the creative layer must not be able to bypass the evidence, versioning and human-decision protections.
- The proposal's data shape (stages, checkpoints, decisions, contributions, agents, reviews, versions, directions, slides) is defined in `src/domain/proposal.ts`. Use it as the draft contract; where your backend differs, adapt in the mapper.
- `src/proposal/needs.ts` (`needsYou`) is the single source of the "needs you" count (Home, Overview badge, list). If the backend computes it, still call this function with the mapped proposal, or replace the function body in that one place.
- The `.pptx` export (`src/proposal/pptx.ts`) runs in the browser from the proposal data. Keep it working with real data; it needs images as data or URLs the browser can fetch.

## 5. Rules (do not weaken these)

- Do not describe simulated image observations, reviews or demo transitions as actual model execution. Labels WORKING / PROTOTYPE stay accurate: when a feature becomes real, change its label in the data, not by hiding labels.
- Demo controls and reset tools belong in a development-only area (`/dev`), never in the live product.
- Preserve the backend's evidence, versioning and human-decision protections. Do not weaken them to make a demo screen look complete.
- A human preference cannot turn unsupported facts into verified evidence. (Example in the UI: a direction the director kept despite reviewer advice is shown as "kept by you", its reviewer notes kept; it does not become "approved by review".)
- Simulated professional and user perspectives must not be described as real customer approval or consumer research.
- Use isolated demo data when testing mutations. Do not modify real projects or trigger paid services while testing.
- Silence is never approval: nothing continues past a checkpoint without an explicit human decision.

## 6. Definition of done

1. `npx tsc --noEmit`, `npx vitest run` and `node scripts/e2e.mjs` pass (the e2e run uses the demo services; keep it working, and add tests for the HTTP adapters with mocked responses).
2. `node scripts/shots.mjs docs/screenshots-new` and compare with `docs/screenshots/` as described in `DESIGN-SPEC.md` section 11: no visual regressions.
3. A short list in the pull request: which screens now use real data, which are still demo, and what the backend must still provide.
4. With `VITE_WORKBENCH_API_URL` set, no screen shows demo-only controls or claims that are not true.
