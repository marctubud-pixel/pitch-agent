# Strategy v2 backend contract

New executed strategy jobs freeze `strategyContractVersion: strategy-v2`. HTTP callers cannot select an older version. The immutable job contains a server-built `strategyBasis` with the confirmed complete task card, confirmations, policy, configured strategy owner, actual research artifact and content hash, research claim manifest, sources, reviewed visuals and original research review and release authority. Dispatch reads and hashes the actual research bytes before recording the exact inputs. Task, evidence, review, release or binding drift prevents current downstream use.

`strategy-contract.mjs` owns the closed bounded body schema, graph checks and canonical prose/limitation traversal. `stage-content.mjs` composes it into the existing producer contract. The response carries `strategyContractVersion` and `strategyBasisHash` as process fields. Normalized client content contains one `strategy` body and no separately authored generic `sections`.

The body includes `coreQuestion`, the `industryCompetitor`, `brandProduct` and `userUsage` circles, their `intersection`, `candidateCuts`, `reasoning` and `answer`. Findings reference top-level claims. Research premises bind the exact research artifact, content hash and claim key. Confirmed task requirements quote a real string leaf of the frozen task card with an exact JSON Pointer. The independent reviewer still judges meaning, applicability, claim completeness and source limitations. Citation identity alone does not prove support.

A grounded proposal needs a three-circle intersection without unresolved gaps and two or three distinct candidates. Conditional exploration may have one candidate. Missing evidence stays in explicit gaps and limitations. A current blocking gap requires a blocked answer. The final answer references the core question and final synthesis. A recommended candidate must be present, nonblocked and included in that synthesis. Chain reasoning links consecutive steps. Total-parts-total links its opening premise, developments and final synthesis without cycles.

Artifact `strategyContract` metadata records the actual version, basis hash, normalized content hash and answer disposition. `grounded_proposal` and `conditional_exploration` remain distinct. Neither metadata nor producer status is independent approval. The reducer verifies the exact original request and response before completion. Blocked output remains execution evidence and cannot become a completed artifact. Original replay uses the saved version and basis, never the latest global defaults.

The independent `creative-strategy-v2` panel sees the entire body, claims and gaps. It keeps the existing five actual role phases and explicit strategy judgment. It does not borrow a numeric copy or visual threshold. Its calibration is specific to this protocol. Old strategy panels cannot approve a v2 artifact. Correction extraction accepts the new protocol while retaining its original reports.

Both actual strategy-to-copy owners must quote the answer, a candidate proposition or mechanism, and a real limitation. All original strategy limits, claim limits and gaps receive stable `strategy:<JSON pointer>` restriction IDs. Original research owner restrictions also remain operative. Consumer reports disposition every producer permission and restriction. The committed copy request freezes the complete original strategy bytes, explicit selected strategy contract and both actual owner reports.

Complete-content obligations enumerate the true strategy prose leaves and limits under their original JSON Pointers. The existing complete manuscript validator requires exact visible coverage. Missing a circle, intersection, candidate, reasoning, answer or limitation obligation is rejected. Metadata and graph IDs are not client prose.

Historical jobs without a selected version remain v1. Their old request, schema, normalized response and panel hashes remain unchanged. No three-circle body is inferred from old paragraphs. New bound production cannot use that historical read path. Imported metadata never substitutes for executed strategy-to-copy acceptance.

Run the local isolated tests with Node's test runner. They use fresh temporary SQLite databases, local synthetic providers and original files. No external service or actual consumer approval is involved.

- `strategy-contract.test.mjs` covers closed schema, both reasoning forms, conditional and blocked output, exact requirements and research references, graph attacks, historical byte compatibility and per-pointer full-content omission rejection.
- `strategy-runtime.test.mjs` executes actual synthetic research, independent research checks, research owner handoffs and release, strategy v2, independent evidence and creative reviews, both strategy-to-copy owners, copy production and reopened idempotent replay.
- `owner-edge.test.mjs` covers actual owner jobs, blocked return, retained human feedback, typed correction, new reviews and original-history preservation.
- `selected-stage-original.test.mjs` reads actual saved invocation packets, responses, normalized files and command witnesses for strategy and copy.

These tests establish the strategy backend contract and its integrations. They do not establish real brand quality, consumer research or the later full PPT delivery goal.

The renderer source manifest is renewed for the changed complete-content module and the new strategy module's evidence dependencies. `layoutRendererIdentity()` returns the new closure hash, and `verifyLayoutRenderer()` rejects the historical closure against new source bytes. Saved layout configurations and historical approvals are not rewritten. They need an explicitly renewed configuration and fresh downstream approval. This closure check does not run or approve a PPT render.

The ordinary `stage-original.mjs` reader now supports strategy-v2 using its saved basis. Its preexisting exclusions for revision, recovered and visual-catalogue production remain explicit. Strategy delivery and correction receipts use their existing dedicated validation paths with the saved strategy contract.
