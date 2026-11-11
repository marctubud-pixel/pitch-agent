# Image API transport reference

The first adapter implements `openai-images-v1`. It sends one generation JSON request or one edit multipart request and accepts exactly one final PNG or JPEG in `data[0].b64_json`. Other protocols need another adapter. A transport result does not approve a candidate or advance a stage.

The response reader accepts additive metadata in the documented [generation](https://developers.openai.com/api/reference/resources/images/methods/generate) and [edit](https://developers.openai.com/api/reference/resources/images/methods/edit) response shapes. It discards unused fields before canonical evidence, including background, output format, quality, safety identifier, size and result URLs. It never downloads a returned URL. The decoded bytes determine the saved media type and dimensions. A conflicting format label does not change PNG bytes into WebP, and actual WebP bytes remain unsupported. This is bounded protocol compatibility, not live vendor verification or support for every future field.

## Backend configuration

`WORKBENCH_IMAGE_CONFIG` names a backend JSON file. The server reads the credential only from the environment variable named by `credentialEnv`. There is no default service, model or credential. Setup never sends a network request.

Required fields are `providerId`, `adapter`, `baseUrl`, `model`, `credentialEnv`, `operations` and `supportedOptions`. `adapter` is `openai-images-v1`. `baseUrl` is the operator's HTTPS API base, which may include a prefix such as `/v1`. It cannot contain credentials, a query, a fragment, escaped paths or traversal. The adapter appends `/images/generations` or `/images/edits`. HTTP loopback is available only through explicit programmatic test injection.

`operations` contains the booleans `generate` and `edit`. At least one is true. `supportedOptions` has `generate` and `edit` objects. Each maps allowed option names to arrays of accepted values. The names are `size`, `quality`, `background`, `output_format` and `response_format`. An empty object declares no optional fields. `output_format` accepts only `png` and `jpeg`. `response_format` accepts only `b64_json`. No optional field is sent unless the request selects a declared value. `n` is always one.

The optional integer limits have these maximums and defaults.

| Field | Maximum and default |
| --- | --- |
| `timeoutMs` | 300000 |
| `maxInputImages` | 4 |
| `maxRequestBytes` | 35651584 |
| `maxResponseBytes` | 12582912 |

The credential stays in a private prepared call and the authorization header. It is absent from receipts, configuration fingerprints, browser responses and saved request evidence. The safe configuration fingerprint includes the environment variable's name, never its value. The fingerprint does not identify credential values or rotation. Capability and preparation read the current value of the named credential reference. Execution reads it again immediately before HTTP dispatch. Removal, invalidity or a changed value consumes the prepared call and returns a local refusal with `dispatch: 'not_started'` and a fixed diagnostic. It creates no remote receipt and sends no request. A newly prepared call can use the current valid value. Configuration changes still require reconstructing the provider. Local recovery does not require an active credential.

`GET /api/capabilities` exposes `image.configured`, `invocationSupported`, `stageIntegrated`, `liveVerification`, a safe binding, operations and limits. In this transport unit, `available` and `stageIntegrated` stay false, and both live verification statuses stay `not_verified`. Future project-owned genuine invocation receipts must establish live verification. Fixture calls do not establish it. There is no image job enqueue endpoint.

## Provider interface

`loadImageProvider()` returns `capability`, `prepare`, `execute` and `recover`. It does not own project jobs, call allowances, candidate adoption or stage permissions.

`await prepare(task, verifiedInputs)` performs local validation and complete image decoding. The task contains `protocol: 'image-candidate-v1'`, `projectId`, `jobId`, `candidateId`, `attemptId`, the capability's `binding`, and `operation`. The operation has `kind`, `prompt`, and `options`. An edit also has ordered `images` with `imageId` and `sha256`. The backend supplies corresponding verified inputs with `imageId`, `sha256`, `mediaType`, `byteLength`, and `bytes`. Paths and URLs are not inputs. Preparation copies the request and input bytes and returns an opaque prepared call or a fixed local refusal.

`await execute(prepared, {evidenceDir, signal})` consumes that in-memory prepared call and sends one request. The caller must establish durable dispatch authority before calling it. This unit does not implement that authority. Reconstructing and preparing the same task can send another request, so this raw transport is not durable exactly-once execution. A future project integration must prevent repeated dispatch and reserve the existing call allowance atomically. It must account separately for proven local pre-dispatch refusals and dispatched unknown attempts. A pre-dispatch refusal makes no claim about cancelling an earlier remote call or refunding an unknown attempt.

A successful result has `kind: 'image'`, exact image `bytes`, and a safe `receipt`. A known HTTP 4xx returns `rejected`. Redirects, 5xx, interruption, timeout, malformed output and failed local evidence persistence return `unknown`. No result retries automatically or changes model. Unknown outcomes cannot establish remote cancellation, free cost or absence of a generated image. Returned model and configured model remain separate. Absent provider request ID, reported model, usage or monetary evidence remain null. This adapter records numeric token usage only and does not infer a price.

Saved usage contains only `input_tokens`, `output_tokens`, `total_tokens`, and the `image_tokens` and `text_tokens` members of `input_tokens_details` and `output_tokens_details`. Known counters must be nonnegative safe integers or null for an unknown value. Present non-null usage and detail containers must be objects. Unknown members are discarded. Empty usage objects remain empty for recovery compatibility, and empty extracted detail objects become null. Absent counters are not filled with zero or inferred from other counters. These values are provider-reported facts, not billing or approval authority. Null response IDs and models also remain unknown. Invalid known values still invalidate the success response.

`await recover(task, attemptId, evidenceDir, {expectedEvidence})` makes no network request. `expectedEvidence` is the successful receipt's `responseEvidence`, held by a trusted caller. Recovery validates the anchor, all protected files, the exact request and decoded output. Missing anchors, changed requests, partial evidence or changed files return `unavailable`. Recovery works when current service configuration and credentials are absent. A malicious operating-system account that can rewrite both the external anchor and all files is outside this integrity boundary.

The parent accepted asynchronous preparation because the existing full image decoder is asynchronous. The parent also accepted the required caller-held recovery anchor. A crash after evidence persistence but before the caller saves that anchor can remain unknown. The next project unit must persist the anchor before generated import and completion. This transport unit does not claim that project crash recovery chain is complete.

## Evidence and generated assets

Success evidence uses mode-0400 files inside mode-0700 directories. Exclusive temporary writes, file sync, non-overwriting publication and a manifest committed last preserve exact image bytes and a canonical response extraction. Every new success has `rawResponseRetained: false`. The complete HTTP response is never retained or hashed. Its manifest hash covers the canonical extraction, not the complete HTTP response. The extraction preserves the exact image payload and safe response model, ID and numeric usage. Other response metadata, including revised prompt and creation fields, is discarded. Recovery verifies this extraction and does not replay the complete HTTP response. Recovery requires the caller's manifest digest. Error bodies are never saved.

The original response must parse completely as JSON with exactly one valid output before extraction. The exact decoded image bytes and parsed allowlisted metadata are screened before hashing or persistence. The bounded scanner covers literal credential text, direct standard and URL-safe base64, lower/upper hex, URI encoding and full lower/upper percent-byte encoding, lowercase hex escapes, one or two full Unicode escape layers, and up to two JSON string escape layers over those representations. Authorization text is also rejected. Tainted extracted data produces a fixed unknown result with no evidence. This is a bounded set of known representations, not recognition of arbitrary mixed encodings, encryption or all obfuscations. Discarding unused metadata avoids requiring its arbitrary text to pass an expanding decoder.

`imageStore.ingestGenerated({projectId, result})` is a trusted backend method for a verified or recovered image result. It revalidates actual image bytes and the receipt's project and output identity. The stable asset ID derives from project and attempt, so altered output or provenance for that identity conflicts. Identical imports return the exact same record, including across process restart. Generated provenance is separate from supplied images. The public upload method rejects `representation: 'generated_image'`.

Neither generated import nor a provider receipt registers an asset in a project. The future project completion command remains the sole writer that makes generated candidates visible and eligible for later review.

## Local verification

`node --test tools/workbench/image-api-provider.test.mjs` exercises real local HTTP JSON and multipart requests with tiny fixture images and a test-only credential. It uses no external service and cleans temporary directories. The suite includes an isolated SQLite-backed workbench server for the capability endpoint. Local socket permission may be needed when a sandbox denies loopback listeners.
