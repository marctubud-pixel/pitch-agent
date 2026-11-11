# Assistant HTTP API v1

The assistant reads project records. Its SQLite history lives under `executions/assistant/assistant.sqlite`, separate from project revisions. It never receives a command or scheduler interface. Local server identity is `local-operator`. Deployments with a narrower read boundary supply the trusted `assistantReadAuthorization(projectId, principal)` callback. A client cannot supply its principal or permission.

Every response carries `protocol: workbench-assistant-v1`. The frozen frontend is unchanged. Its later adapter can map `answers[].blocks` and references to the existing assistant domain. This backend uses `conversationId` and request states in addition to that rendering contract.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/assistant/schema` | Closed request and model output JSON schemas |
| GET | `/api/v1/assistant/capabilities` | System and configured model availability |
| GET | `/api/v1/assistant/projects/{projectId}/conversation` | Current project conversation |
| GET | `/api/v1/assistant/general/conversation` | Current general conversation |
| GET | `/api/v1/assistant/draft/conversation` | Current unconfirmed draft conversation |
| GET | Same scope paths with `/suggestions` | Fixed system question intents |
| POST | `/api/v1/assistant/questions` | Persist and answer one exact request |
| POST | `/api/v1/assistant/conversations` | Start a new conversation and retain old audit rows |
| POST | `/api/v1/assistant/reconciliations` | Read a saved original for an unknown request without dispatch |

Routes reject unknown fields and query parameters except the closed history queries described below. Project scopes contain exactly `kind` and `projectId`. General and draft scopes contain only `kind`.

A question body has the following shape.

```json
{
  "scope": {"kind": "project", "projectId": "p"},
  "conversationId": "the-current-conversation-id",
  "requestId": "caller-stable-unique-id",
  "question": "Explain the recorded blockers",
  "intent": "interpret"
}
```

`intent` is `status`, `blockers`, `next_step`, `evidence` or `interpret`. The first four are deterministic system records, explicitly labelled `system_records`. They are selected by the explicit intent, never by question keyword matching. `next_step` lists explicitly blocked jobs and reports that current gates are not evaluated. Source registration does not certify authenticity or support.

Draft questions may add `draft: {fields: {age: null, objective: "supplied text"}}`. At most 40 named string or null fields and 16 KiB are accepted. They carry `knowledge: unconfirmed_user_input` in the frozen packet. Draft and general scopes never read any project. Draft values cannot be adopted by this API.

A reset body contains `scope`, `conversationId` and `requestId`. A reconciliation body contains `scope` and `requestId`.

## Request identity and recovery

A request ID belongs to one principal and scope. The exact parsed JSON body is retained. The same ID with the same serialized body returns its retained result without another call. Changed body or property order conflicts with HTTP 409. New intentional questions use new IDs. Reset commands have the same exact identity rule.

The runtime reserves a request before dispatch and saves the ordinary HTTP locator before any send. `reserved` is presented as `unknown`. Neither reading, duplicate asking, restart, changed provider configuration nor reconciliation sends an unknown request again. Reconciliation can adopt only an exact retained successful original. Unrecoverable unknowns remain unknown. There is no automatic retry route.

Successful model answers verify their retained original on every read. This works without current provider configuration. Corrupt, missing or changed successful originals return `ASSISTANT_ORIGINAL_INVALID`. An answer retains its original project revision, task card hash, snapshot hash and input packet hash. Later revisions set `stale`, including changes during the provider call.

History survives restart. Clearing changes the active conversation pointer and retains all prior conversations, requests and originals. Conversation and history reads expose cursor pagination as documented below.

## Model boundary

Launch configuration supports an `assistant` binding through the existing `textProviders` and `bindings` objects. This unit accepts only `workbench-model-http-v1`. Legacy CLI assistant bindings report `ASSISTANT_MODEL_UNAVAILABLE`. The ordinary provider owns authentication, exact wire originals, unknown outcomes, null usage and cost, and configuration-free reopen. No second transport is introduced.

The provider must match the frozen binding and use `maxOutputBytes` at most 32768 and `maxResponseBytes` at most 204800. `maxRequestBytes` must accommodate the domain packet. Missing credentials make model capability unavailable. Configured bearer secrets are not returned, written into assistant context or copied from echoed request data. Every intent checks request and frozen context against nonempty bearer values named by supplied provider configurations, including configurations currently unavailable for model calls. A match rejects before retaining the request. This prevents duplication of credentials already present in user or project text; it does not extract credentials into answers. Provider failures return fixed public codes.

Model output is a closed `assistant-answer-v1` object containing one to twelve blocks. Blocks contain exactly `kind`, `text`, `items` and `referenceIds`. Accepted kinds are `interpretation`, `recommendation`, `missing` and `guidance`. All model blocks carry `verification: unverified_model_interpretation`, including prose that discusses source support, user decisions or approval. Such prose has no factual or approval authority. `fact` blocks, command members, additional nested members and identifiers outside the frozen registry are rejected. Only deterministic system blocks can use `fact`.

The context contains a bounded, explicitly partial view of registered records. It does not open artifact payload files or certify underlying source originals. Oversized projects or contexts return an explicit unavailable or limit response. This unit does not replace upstream source verification, independent review, stage authorization or content quality acceptance.

## Results and errors

| HTTP | State or error | Meaning |
| --- | --- | --- |
| 200 | `complete` | System answer or verified ordinary model output |
| 202 | `unknown` | The result is uncertain. Never resend automatically. |
| 400 | `ASSISTANT_INVALID_REQUEST`, `ASSISTANT_INVALID_SCOPE`, `ASSISTANT_INVALID_DRAFT`, `ASSISTANT_SECRET_ECHO` | Malformed or forbidden input |
| 403 | `ASSISTANT_FORBIDDEN` | Trusted read policy denies the project |
| 404 | `ASSISTANT_PROJECT_NOT_FOUND`, `ASSISTANT_REQUEST_NOT_FOUND` | No matching project or scoped request |
| 409 | `ASSISTANT_REQUEST_ID_REUSED`, `ASSISTANT_CONVERSATION_CONFLICT`, `ASSISTANT_REQUEST_ACTIVE` | Exact identity or active execution conflict |
| 413 | `ASSISTANT_CONTEXT_LIMIT` | Projection could not fit its declared limit |
| 422 | `rejected`, `ASSISTANT_ORIGINAL_INVALID` | Invalid output or damaged retained original |
| 502 | `failed` | Saved known provider rejection |
| 503 | `unavailable`, `ASSISTANT_BUSY`, `ASSISTANT_CONTEXT_UNAVAILABLE`, `ASSISTANT_STORAGE_UNAVAILABLE` | Missing model or unavailable local infrastructure |

Transport-level errors include `retryable`. A retained unknown result is never permission to repeat the model call. The client can explicitly repeat a proven unavailable request only with a new request ID after inspecting the prior result.

## Isolated verification

Use a Node version with `node:sqlite`.

```sh
node --test tools/workbench/assistant-http.test.mjs
```

The tests create fresh synthetic databases and loopback services. They retain evidence roots in their output. They do not read real projects, contact external services, spend provider credits or modify the frozen frontend.

## Large-project projection and history revision

Conversation GET accepts only optional `conversationId` and `cursor`. Each scope also has `/history`, accepting only `cursor`. Unknown or duplicate query parameters are rejected. Conversation pages contain at most 20 answers in chronological order and `nextCursor` for older answers. History pages contain at most 20 conversations newest first. Selecting a retained conversation requires the same principal and scope. Positive decimal row cursors never bypass scope ownership.

Scope checks, conversation reads and stale checks read only the current head revision. They do not decode the project snapshot. A new question uses one store-owned snapshot admission under the existing 256 MiB decoded format limit and 257 MiB plus 84-byte stored limit. Admission happens before fetch and BLOB digest verification before projection. It still decodes the full admitted snapshot once; it is not a streaming index, and JavaScript object memory is unmeasured. No project database migration or mutation is performed by assistant operations.

Model context is at most 128 KiB with at most 200 selected records and a 100 KiB registry budget. Current brief, recorded stages and active artifacts take priority. Every answer exposes `coverage`, including selected/total/omitted candidate counts, collection counts, field truncations and exclusions. Counts apply to the declared view candidates, not every project record. Coverage names unrepresented top-level fields and states that omitted records were not reviewed. Task-card counts cover the active card only. Full raw payloads, original files and technical receipts are excluded, except registered source catalogue metadata. Brief strings cap at 8,000 code units, excerpts at 2,000 and other strings at 1,000; truncations and omitted fields are marked. `basedOn.snapshotHash` binds the verified stored snapshot byte digest. Registry references include exact source JSON pointers. References outside the selected registry are rejected. The projection is always partial; it does not claim whole-project review.

Status is explicitly recorded metadata. `status` lists recorded job state and active artifact IDs. `blockers` and `next_step` list explicitly blocked jobs. Current approval, freshness and release gates are not recomputed. `coverage.gateEvaluation` is `not_performed`. Recorded release presence is not current authorization. This preserves the distinction between observed records and an independently evaluated gate.

Corrupt snapshots or snapshots beyond the existing store resource limit refuse new context creation. Retained conversations remain readable when authorized head metadata and retained assistant originals are intact. Oversized individual projected fields are explicitly truncated; exceeding the final view budget refuses the view.

Shutdown stops admitting assistant operations immediately and drains all owned asynchronous operations before closing assistant storage. Server shutdown waits for HTTP closure, scheduler work and assistant work before closing project storage. Concurrent close callers share one shutdown outcome. Disconnected callers do not cancel or repeat provider attempts; completed originals and unknown outcomes are retained normally.
