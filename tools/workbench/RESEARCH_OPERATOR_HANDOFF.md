# Research operator handoff backend

This protocol adds an explicit operator workflow alongside existing model-owner orchestration. The first saved declaration selects the operator workflow for the project. Changing the policy or research version does not remove that selection.

Projects without declarations retain the existing automatic path. Selected human gates still require their existing real human adoption. Existing research-handoff-v1 and research-handoff-v2 packets, prompts, schemas, reports, and receipt validation remain compatible. No historical agent release becomes human approval.

## Persisted records

`researchHandoffDeclarations` contains append-only local operator role declarations. The records retain the exact permittedUses, prohibitedInferences, unresolvedIssues, note, side, and decision supplied by the operator. The server adds the actor, role, time, current evidence basis, and request identity. These records do not authenticate the named project owner.

A positive declaration atomically queues one separate `handoff` job. Its protocol is `research-handoff-v3`. The packet and report bind the declaration ID and canonical hash. The consumer also binds the producer declaration and the exact accepted producer report. Existing actual invocation receipts, independent assessment validation, original reports, correction handling, and fresh execution contexts remain mandatory.

A returned declaration creates no job and grants no permission. A new delivery after a return starts another declaration pair. Prior declarations and reports remain readable. A blocked model report still requires corrected research. Another declaration cannot erase that blocker.

A `research-operator-release` entry in `releases` records a separate local human action. It binds both declarations, both actual reports, the assessment basis, and the policy. It performs no provider call and creates no strategy job. This explicit release can satisfy a selected research human gate without inventing an adoption review.

`researchContinuationIntents` records continuation separately. One release determines one strategy job ID. Generic strategy enqueue cannot replace this request. Valid strategy correction jobs retain the same human and model constraints through the existing correction contract.

## API

All commands require commandId and expectedRevision. Exact replay returns the original record before current-version checks. Reusing a command ID with changed input fails with COMMAND_ID_REUSED. A client with an unknown result must resend the same command and body.

`GET /api/projects/:projectId` adds `view.researchWorkflow`. It contains the authorizationPath, active artifact, basis hash, effective declaration IDs, current owner job and report references, current release ID, five fixed checks, suggestions, action permissions, continuation eligibility, and alreadyContinued. The five IDs are verification, readiness, delivery, acceptance, and release. On the model-only path, delivery and acceptance reflect actual model-owner reports. On the operator path, each also requires its bound declaration. alreadyContinued is true once the durable continuation exists, including before dispatch.

`POST /api/projects/:projectId/research-handoffs` accepts the following body.

```json
{
  "artifactId": "current research artifact ID",
  "contentHash": "64 lowercase hexadecimal characters",
  "basisHash": "view.researchWorkflow.basisHash",
  "commandId": "unique command ID",
  "expectedRevision": 12,
  "input": {
    "side": "research_owner",
    "decision": "delivered",
    "permittedUses": ["Exact bounded use"],
    "prohibitedInferences": ["Additional operator prohibition"],
    "unresolvedIssues": [],
    "note": "Exact operator note"
  }
}
```

The research side accepts delivered. The strategy side accepts accepted, accepted_with_conditions, or returned. A return requires a note. Remaining producer concerns require accepted_with_conditions. The response contains receipt.handoffId, receipt.jobId, receipt.revision, and receipt.replayed. A null jobId means no model task was created.

`POST /api/projects/:projectId/research-release` accepts artifactId, contentHash, basisHash, policyVersion, commandId, and expectedRevision. Its receipt includes releaseId and artifactId. The executor checks saved research bytes before a new release commit. Replay does not recreate current authority.

`POST /api/projects/:projectId/continuations` retains artifactId, policyVersion, commandId, and expectedRevision. In an operator project, it consumes an existing current explicit release and creates a durable intent before enqueue. It never creates a missing release. Restart reconciles that intent with its deterministic job.

The runtime methods are recordResearchHandoff, releaseResearch, continueResearch, recoverContinuations, and researchWorkflow. recordResearchHandoff and releaseResearch are asynchronous. Direct runtime callers supply trusted local human context for declaration and release writes. Public HTTP callers cannot supply actor identity, reports, provider bindings, receipts, timestamps, or assessment objects.

## Restriction and failure behavior

Owner permissions must be exact-string subsets of the actual independent allowed uses and the operator's requested uses. Consumer permissions must also be subsets of the producer's permissions. Every independent, producer, and operator prohibition remains verbatim. The owner must classify each disclosed operator concern and retain producer concerns. The strategy packet contains both unchanged declaration records, both original owner reports, independent readiness history, and the explicit release.

Unknown owner outcomes prevent replacement declarations, release, and continuation. They retain their original attempt and response evidence. Provider or source changes before dispatch stop the call. Input bytes and authority are checked again after the provider returns. A result after drift cannot publish a current strategy artifact. Original provider responses remain available through existing recovery records.

The new workflow requires a current research-readiness-v2 assessment. Legacy model-only callers do not acquire that new requirement. Migrating an old artifact with stale or blocked original reports still follows existing correction requirements. This protocol does not silently upgrade old reports.

The tests use new temporary SQLite databases and injected synthetic providers. HTTP tests bind only localhost port 0. They establish mechanics and authority checks, not research quality, real owner authentication, client approval, or editable PowerPoint delivery.

The strategy delivery envelope carries `researchOperatorConstraints` only for the declaration protocol. Each entry retains the exact current declarations, both actual model reports, the independent assessment and explicit release. Prohibitions and model limitations have stable IDs tied to their artifact, declaration or report ID, field and index. Both strategy and copy owner reports must retain every origin as an operative restriction and explicitly disposition it. The independent conditional applicability manifest includes v3 reports. Historical v1 and v2 handoff packets remain unchanged.

For this protocol, downstream permitted uses use an exact-string subset contract. Every downstream owner permitted-use text must appear in the intersection of independent allowed uses, both operator declarations and both actual model reports. This conservative representation rejects new wording, including paraphrases or appended permission text. Semantic interpretation of arbitrary strategy prose remains an actual owner judgment with independent evidence review. Structural validation does not prove semantic compliance or customer approval. Changing or returning the bound authority invalidates the downstream envelope.

Assessed v2 and v3 handoffs are explicit correction-source protocols. Their inventory retains the full original validated handoff input, independent assessment, restrictions, report metadata and declaration commitments when present. A blocking unresolved issue remains actionable. Nonblocking issues remain preservation constraints. Source planning still validates the original job, successful attempt, provider receipt, request hash and report normalization before creating the inventory. Unsupported protocols remain rejected.
