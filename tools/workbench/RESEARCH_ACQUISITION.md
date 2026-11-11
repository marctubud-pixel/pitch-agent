# Research acquisition v1

Research acquisition freezes a confirmed task and collects bounded public background material before the existing research-data-v2 producer. Existing supplied-source jobs continue to use their original path. The frontend is unchanged.

## HTTP interface

The versioned endpoints are `POST /api/v1/projects/:id/research-continuations`, `GET /api/v1/projects/:id/research-status`, and `POST /api/v1/projects/:id/research-cancellations`. Their `/api/projects/:id/...` aliases share the same handler. The ordinary JSON request cap remains 128 KiB.

A continuation body has exactly `protocolVersion: "research-acquisition-v1"`, `commandId`, `expectedRevision`, `sourceEntryIds`, and `materialIds`. The selections identify registered project records. Empty selection arrays are valid. HTTP cannot supply a completed journal, acquisition proof, source catalogue, custom model, search endpoint, or budget.

A cancellation body has exactly `generationId`, `commandId`, `expectedRevision`, and `reason`. Cancellation stops queued work. A dispatched unknown outcome retains its reservation and requires exact saved-original reconciliation. Cancellation does not discard uncertainty.

The executor exposes `continueResearch(projectId, request)`, `advanceResearch(projectId)`, `researchStatus(projectId)`, and the existing `execute` and `reconcile` entry points. Old research-to-strategy continuation requests retain their old interpretation. Acquisition uses a versioned request to distinguish the new upstream operation.

## Configuration

`workbench-launch-v1` optionally accepts a `researchAcquisition` object and a separate `searchProviders` registry. A minimal acquisition object is `{"searchProviderId":"discovery"}`. Optional `limits` may lower the finite server policy. The bindings `research_planner` and `research` select ordinary configured text providers. Search providers never enter the text-provider registry.

A DDG provider is `{"adapter":"ddg-lite-v1"}`. A JSON provider supplies `adapter: "json-http-v1"`, a fixed public HTTPS `endpoint` without a query, one `queryParameter`, and bounded property-path arrays `resultsPath`, `urlPath`, and `titlePath`. An optional bearer reference is exactly `WORKBENCH_RESEARCH_SEARCH_BEARER`. Custom headers, URL templates, executable parsers, and arbitrary environment names are rejected. Credentials are not persisted. Both adapters pin public DNS results, enforce finite byte and time caps, and perform no redirects or hidden retries.

Absent acquisition configuration adds no legacy launch option, binding, basis field, request field, prompt change, or receipt field. The optional Codex call deadline, AbortSignal, and output cap do not enter provider input bytes. Old calls retain their configured timeout. These acquisition options are rejected for the separate final-review operation.

## Generation and authority

One immutable envelope preserves the complete task card and confirmations, every selected manual record, registered material originals and adoption, policy and human gates, scope and unknowns, provider identities, fixed branch allocations, and one persisted deadline. Both automatic and assisted modes require task confirmation before research effects. The existing post-research owner and human release gates remain in their existing positions.

One planner invocation creates four ordinary scheduler jobs for professional reports, brand and product, same-purpose competitors, and users and scenarios. Each branch owns its journal and fixed allowance. A dispatch claim reserves the maximum call, byte, extraction, and type allowance before an effect. Unknown dispatch cannot automatically repeat. Exact saved originals can reconcile an interruption. An explicit next generation preserves ancestry.

The default envelope allows eight queries, five selected results per query, twelve page attempts, four PDF attempts, twelve admitted records, and 128 KiB of complete admitted text including selected inputs. Optional declared-image capacity is reserved; this implementation admits no image interpretation. Each search response retains at most fifty considered anchors or JSON rows. Every considered duplicate, rejection, and result outside the five-result selection remains recorded. DDG acquisition reparses its retained response through an acquisition-only window. Legacy visual receipts retain their original refusal behavior above fifty anchors.

Page attempts use no redirects. Failed responses, unsupported MIME, unsupported encoding, scanned PDFs, and images remain explicit gaps with bounded raw response originals. HTML text is reconstructed from the actual raw capture. PDF text requires the retained bounded extractor receipt and exact tool identity. Complete text above its cap is excluded rather than truncated. Equal complete text is not independent corroboration. Branch labels never establish professional authenticity, factual truth, consumer preference, or direct competitor eligibility.

Admission reads project revision R, reopens originals, saves an immutable manifest, and commits only at R with exact logical identities. A conflict requires complete revalidation. The acquisition-only manifest store has a fixed 16 MiB cap. Ordinary intake results retain their 4 MiB cap. One physical acquisition verification reserves at most 512 MiB and 512 file reads, with conservative reservations for inherited material reads. The larger manifest cap cannot be selected by HTTP or a model.

Only acquisition producers add `researchDataBasis.acquisition`. `requireResearchDataBasis(basis, sourceRecords)` keeps its two-argument pure signature and verifies complete frozen bytes. `project.requireResearchBasis` resolves the exact registered generation and complete catalogue. Runtime authority reopens physical originals before enqueue, dispatch, returned-output admission, normalization, reconciliation, verification, readiness, handoff, release, and downstream consumption. Corrections retain their ancestral acquisition reference. Historical inspection uses frozen configuration. New authority also checks compatible live configuration.

A deterministic producer command repairs a crash after seal without repeating acquisition. Empty acquisition retains an empty basis and the existing blocked research_plan behavior. A sealed acquisition proves bounded collection closure, not completed business research or content quality.

## Verification boundary

Engineering tests use fresh temporary SQLite databases, owned loopback HTTP servers, and synthetic DNS, HTTP, model, and PDF adapters. They do not prove external search reachability, real provider authentication, publisher authenticity, research adequacy, customer approval, or consumer preference. No real project or paid service is used.
