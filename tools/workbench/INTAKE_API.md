# Intake and structured task cards, version 1

This backend retains PDF, PNG/JPEG and public HTTPS originals, creates a model extraction draft, and requires separate human adoption, field decisions and exact confirmation. Frontend files are unchanged. Captured text, pixels, quoted statements and human requirements do not establish source authenticity or market facts.

## Runtime configuration

Use the existing `workbench-launch-v1` deployment file. Add `bindings.intake` with `providerId`, `model` and `role`, pointing to an existing configured text provider. The provider receives the full frozen material packet, JSON Schema and each actual image. The production `codex-cli` adapter is supported. It is not invoked during capability checks. No intake binding means `INTAKE_PROVIDER_MISSING` and zero model calls.

Add `moduleConfigs.intake` pointing to a separate JSON file.

```json
{
  "pythonBinary": "/absolute/path/to/python3",
  "limits": {"pages": 100, "timeoutMs": 20000}
}
```

The tested interpreter is `/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3`, with Python 3.12.14, pypdf 6.10.0 and pdfplumber 0.11.9. `python3` on PATH is not an equivalent configuration. Dependencies are not installed automatically. Limits may be reduced, never increased above the policy defaults.

`GET /api/v1/intake/capabilities` runs an actual local bounded import/resource probe. It reports interpreter and worker hashes, versions, actual memory monitoring status and configured model identity. It does not authenticate or invoke the model. macOS rejected `RLIMIT_AS` in testing. The receipt therefore states `hardAddressSpaceLimit:false` and `hardRssCap:false`. An owned-child RSS watchdog samples the actual child through `/bin/ps`, checks its parent PID, and kills then awaits the child above the threshold. This is sampled protection, not a hard RAM ceiling. A missing or unreadable watchdog fails admission. CPU limits, a deadline, output bounds and kill-and-await still apply. The process runs isolated Python with bytecode disabled. Worker code is read once and the exact bytes are passed to the interpreter.

Default PDF limits are 12 MiB input, 100 pages, 1 MiB canonical text, 100,000 word records, 4 MiB output, 4 KiB diagnostics, 20 seconds and a 512 MiB observed RSS threshold. The worker records empty, partial, encrypted, malformed and limited documents without pretending to run OCR. Words have actual PDF point coordinates in a separate channel. Quote locators use canonical ordered page text joined by `\f`, with UTF16 code-unit offsets. No quote bounding boxes are invented.

## HTTP contract

All routes retain the existing loopback Host and same-origin mutation checks. Human context comes from the server. Clients cannot send actors, model bindings, receipts, reports or filesystem paths. Every mutation requires a unique bounded `commandId` and an observed integer `expectedRevision`. Replay of the exact original request returns its original resource. Changed requests fail with `COMMAND_ID_REUSED`; stale revisions fail with `REVISION_CONFLICT`.

Create the project with the existing `POST /api/projects` route. `GET /api/v1/projects/:projectId` returns its current persisted snapshot. All paths below have the `/api/v1/projects/:projectId` prefix.

| Method and path | Request fields in addition to commandId and expectedRevision | Result |
| --- | --- | --- |
| POST `/documents` | `base64`, `originalFilename` | Registered document and optional local job ID. Actual bytes determine PDF/PNG/JPEG type. |
| POST `/documents/url` | `url` | Local capture job. Existing HTTPS public DNS, redirect and bounded transport checks apply. |
| GET `/documents` | none | Registered document history. |
| GET `/documents/:id` | none | Document identity, hash and checked extraction. |
| GET `/documents/:id/original` | none | Checked original bytes with attachment disposition and hash ETag. |
| POST `/task-card-extractions` | `documentIds`, `baseTaskCardId`, `baseTaskCardHash` | Frozen model extraction job ID, never a confirmed card. |
| GET `/jobs/:jobId` | none | Persisted status and attempts. |
| GET `/task-card-drafts` | none | Drafts and `draftHash` values. |
| POST `/task-card-drafts/:id/adoptions` | `draftHash`, `baseTaskCardId` | New active, unconfirmed task card. |
| GET `/task-cards` | none | Active identity, historical cards, card hashes, decision-set hashes and confirmations. |
| GET `/task-cards/:id` | none | Checked card and exact hashes. |
| POST `/task-cards/:id/decisions` | `taskCardHash`, `decisions` | New card version retaining source and decision history. |
| POST `/task-cards/:id/revisions` | same as decisions | The same immutable revision operation. |
| POST `/task-cards/:id/confirmations` | `taskCardHash`, `decisionSetHash` | Human confirmation of that exact active version. |
| POST `/jobs/:jobId/local-retries` | none | Explicit retry only for failed/blocked/interrupted local document work. |
| POST `/jobs/:jobId/reconciliations` | `attemptId` | Recovery from the same saved model request/response only; no provider call. |

Upload JSON alone receives a bounded base64 allowance. All other new routes and all legacy general routes keep the 128 KiB JSON limit. Images retain the existing 8 MiB and 20 MP limits. At most four actual images and twenty documents can enter one extraction. The frozen material packet is capped at 2 MiB. Inputs are never silently omitted to fit a limit.

A response containing `jobId` uses 202. Other successful mutations use 200. GET returns 200. Errors return `{error:{code,message}}`; validation uses 400 or 422, unknown registered objects 404 with `NOT_FOUND`, and revision/command conflicts use 409. Consumers should branch on `error.code`.

## Fields and decisions

The exported machine schema is `taskCardSchema` in `intake-contract.mjs`. Core fields cover task type, initial problem, brand/product, objective, deliverables, audience, age, purchaser, user, scenarios, constraints, timing, budget and reference uses. Product parameters are separately named field records. Each field has `value`, `knowledge`, `sources`, `suggestions` and `limitations`.

Model knowledge is `stated`, `not_stated`, `ambiguous` or `suggested`. Stated values must exactly equal each source quote and its validated UTF16 slice. Conflicting original quotes remain ambiguous with null value. Age, purchaser and user require explicit role/age labels on the source text line for stated extraction. A named production parameter requires its label on that line. These conservative lexical checks are admission rules, not semantic certification; uncertain interpretations must be suggestions and remain subject to human decisions. `25` cannot turn into `18-35`, and an age statement cannot fill purchaser/user roles. Light style cannot establish alcohol content.

Image locators identify actual image ID/hash and bounded pixel region. Image/OCR interpretations can be suggested, never source-certified text. A caption or upload label is not pixel observation. An accepted suggestion retains `knowledge:'suggested'` and an explicit human-adopted-assumption limitation.

Generated summaries and adopted suggestions never re-enter later extraction as newly supplied human text. Later extraction retains only the original human inputs and actual human edit statements.

Each decision is exactly `{fieldPointer,action,value,reason}`. Pointers address `/fields/age` or `/productParameters/0/field`, for example. Actions are `retain_stated`, `retain_unknown`, `adopt_assumption`, `reject_suggestion` or `edit`. An edit creates a retained human statement and `human_stated` knowledge. It does not certify a market assertion. Every field needs a current decision before confirmation. Task type, initial problem, objective and deliverables need nonempty values. Unneeded production parameters may remain explicitly unknown with a reason. Required conflicts must be resolved by a new human statement. Rejecting a suggestion clears it; retaining the resulting unknown requires a subsequent explicit decision.

Draft extraction does not replace an active confirmed card. Adoption and each revision create a new active unconfirmed version. The old cards, original materials, decisions, attempts and confirmations remain. The old confirmation API refuses task-card-v1 cards, preventing bypass of exact hashes and field decisions.

## Persistence, recovery and downstream use

The existing SQLite project log owns registration, jobs, attempt claims and human decisions. Files live under the existing execution root in content-addressed `intake/objects` and `intake/results`. Original writes can leave unregistered content-addressed files after a command conflict; these are not project evidence. URL captures and image assets reuse existing checked stores. All reads check regular files, ancestor symlinks, finite lengths, unchanged metadata and content hashes before returning the same checked bytes.

Local PDF failures retain the original. URL originals are registered before local parsing, so missing Python does not discard a successful capture. A local retry reads that registered original rather than capturing the URL again. Parser attempts keep the actual document/extractor result in history.

Each model call saves the frozen packet and schema, dispatch claim and complete bounded provider result independently. The adapter request hash is recomputed, the original `responseText` is parsed, and any `parsedOutput` must match it. A parsed-output-only receipt is insufficient. After dispatch, any unsuccessful outcome becomes `awaiting_reconciliation`. A pending/unknown extraction for the same base card blocks a second model call. Restart never resubmits it. Recovery reads only registered result hashes from the same attempt and revalidates all original bytes and locators. If no successful response was retained, recovery returns `INTAKE_RESULT_UNAVAILABLE` or `INVALID_EXECUTION_RECEIPT`; it does not invent a draft or authorize a retry.

The actual full task-card-v1 snapshot and exact confirmation enter the integrated strategy-v2 basis. String-leaf citations such as `/fields/initialProblem/value` point to real values. A task revision invalidates downstream freshness. Original tampering blocks downstream dispatch even when the task card ID has not changed. Human confirmation remains project-scope authority and never becomes consumer research or source authentication.

## Reproducible verification

Run from the repository root with Node 24.13.0 and the configured bundled Python.

```sh
node --test --test-concurrency=1 tools/workbench/intake-http.test.mjs tools/workbench/intake-pdf.test.mjs tools/workbench/intake-recovery.test.mjs tools/workbench/intake-configuration.test.mjs
```

Tests create new temporary SQLite databases, synthetic PDFs/images, local random-port servers and explicitly injected synthetic provider/URL transports. They never use existing project databases, network services, credentials or paid models. Temporary run evidence is retained for inspection. They prove structural and lifecycle behavior, not real-model extraction quality or source authenticity. Real-provider and real-brand quality validation remains separate.
