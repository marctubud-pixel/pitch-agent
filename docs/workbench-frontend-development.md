# Proposal Workbench Frontend Development Guide

This guide describes how to build a product-facing frontend on the existing local workbench. It documents current capabilities and limits. It does not claim that the full proposal pipeline is automated.

## Project status

The workbench uses a local Node.js HTTP server and SQLite to store projects, revisions, jobs, artifacts, reviews, and handoff records. The current page is `tools/workbench/ui.html`; the server is `tools/workbench/server.mjs`. The default port is 4181. The tool under `tools/auto-layout` on port 4180 is a separate layout utility, not part of the workbench flow.

The current page supports project creation, task-card confirmation and revision, execution mode and human-gate settings, source entry, text-stage job submission, artifact and history viewing, independent excerpt verification, readiness review, owner handoff, research-to-strategy continuation, image registration and observation jobs, and local recovery of eligible saved results. This is a workflow-validation UI. It does not yet have a complete product visual system.

The backend still lacks automatic web search and scraping, image generation, creative scoring and adversarial review, continuation beyond the current stage edge, and a complete layout-delivery flow. Image upload and independent observation are integrated, but the full evidence chain from observations through research citations, verification, readiness, and handoff is incomplete. Do not present an unconnected step as complete or released.

## Goal

Build a clear, traceable proposal workspace. Users need to understand the current stage, the evidence behind each artifact, the blockers, and the actions available next. Improve the presentation and operation of the existing workflow first. Base new backend interactions on real server endpoints. Do not simulate business facts in frontend state.

## Suggested information architecture

1. **Project list and creation**: project name, brief summary, current revision, update or progress indication.
2. **Project overview**: brief and task-card status, execution mode, human gates, stage progress, recent activity, and pending actions.
3. **Research workspace**: artifacts, sources, quoted excerpts, claims, verification reports, readiness reports, and unresolved questions.
4. **Stage handoff**: research and strategy owner acknowledgments, permitted uses, prohibited inferences, release blockers, and the continuation action.
5. **Execution history**: job status, stage, provider receipt, failure reason, recovery action, and revision history.
6. **Sources and observations**: uploaded images, metadata, observation results, and review state. State clearly that observations do not authenticate source origin or consumer preference.

Place available actions next to the relevant stage content. Disable actions based on server capabilities and project state. Explain the blocker instead of showing only a disabled button.

## API and data boundaries

Use the routes in `tools/workbench/server.mjs` and details in `tools/workbench/README.md` as the source of truth. The current UI and server share an origin and use JSON requests. Main endpoints include:

| Purpose | Method and path | Notes |
|---|---|---|
| Read capabilities | `GET /api/capabilities` | Returns stage and tool availability with limitation reasons. Availability can change with model configuration. |
| List projects | `GET /api/projects` | Returns project IDs, names, and current revisions. |
| Create a project | `POST /api/projects` | Creates a project and initial task card. Requires `commandId`, `name`, and `brief`; policy fields can use server defaults. |
| Read a project | `GET /api/projects/:id` | Reads current state. Use `?revision=N` for a historical revision. |
| Record a user decision | `POST /api/projects/:id/commands` | Accepts only server-approved human commands. Include `expectedRevision` and a unique `commandId`. |
| Submit a text job | `POST /api/projects/:id/jobs` | Currently supports `research`, `strategy`, and `copy`. Research can include `sourceRecords`. |
| Read artifact content | `GET /api/projects/:id/artifacts/:artifactId/content` | Returns content after the server checks its registered path and hash. |
| Verification, readiness, handoff, continuation | `POST /api/projects/:id/verifications`, `readiness`, `handoffs`, and `continuations` | See the server and README for request fields. These calls create real jobs or commands, not UI-only state changes. |
| Images and observations | `POST /api/projects/:id/images`, `GET /api/projects/:id/images/:imageId`, and `POST /api/projects/:id/observations` | Uploads are size-limited. Send image bytes, never a local filesystem path. |
| Local recovery | `POST /api/projects/:id/reconciliations` | Revalidates eligible saved output without calling the model again. |

Most mutation requests require `commandId` and `expectedRevision`. On a revision conflict, reload the project and let the user review before submitting again. Do not silently overwrite state. A retry must reuse the same command ID and identical payload. Create a new ID for a new user action.

API responses evolve with the domain model. Before implementation, inspect the current `server.mjs`, `project.mjs`, and README. Do not rely on this guide's field summaries as a frozen schema. The frontend must not fabricate provider identity, review scores, verification results, acknowledgments, release records, or job completion state. The server response is authoritative for business state.

## Implementation conventions

- Prefer adding frontend modules under `tools/workbench/` and keep same-origin local deployment unless the project owner chooses a different stack or deployment model.
- Do not change the independent entry point or port of `tools/auto-layout` to implement the workbench UI.
- Map each displayed state to server project data, a capability response, or explicit temporary UI state. Never present temporary state as saved state.
- Give distinct presentations to queued, running, awaiting-reconciliation, failed, successful-but-unreleased, and stale states. A successfully submitted job is not an approved artifact.
- Keep historical revisions read-only. Warn users before they leave with unsaved input.
- Refer to images, receipts, and citations by server IDs. Do not construct local paths in the browser or trust client-supplied hashes.
- Make errors actionable. For example, tell users to refresh after a revision conflict, inspect the job receipt, or use local recovery when eligible.
- Support keyboard use, semantic controls, sufficient text contrast, and narrow screens. Explain the target and effect of consequential business actions.

## Development sequence

1. Read this guide, `tools/workbench/README.md`, `tools/workbench/ui.html`, `tools/workbench/server.mjs`, and `多线调研工作台_开发说明_v0.3.md`.
2. Map the current screens and response fields. Define page structure and component boundaries before implementation.
3. Build the project list, project overview, research artifacts, and blocker views first. Then refine job and handoff interactions.
4. Connect the real API. For unsupported capabilities, show that they are unavailable and explain why. Do not create fake flows.
5. Run the existing server and verify project creation, history, revision conflicts, and real operation states in a browser. A static screenshot does not prove API integration.
6. In the handoff, list changed files, the steps used for verification, and capabilities that still depend on backend work.

## Key files

- `tools/workbench/ui.html`: current workbench page.
- `tools/workbench/server.mjs`: HTTP routes and request validation.
- `tools/workbench/project.mjs`: domain state and command rules.
- `tools/workbench/store.mjs`: SQLite persistence.
- `tools/workbench/README.md`: startup instructions, current capabilities, and API details.
- `多线调研工作台_开发说明_v0.3.md`: product workflow, gates, and delivery rules.

