# Configure the normal local launcher

`server.mjs` reads optional `WORKBENCH_CONFIG`. Without this setting, the existing six legacy environment settings retain their behavior. Configured mode rejects those legacy settings instead of merging them.

Start the private candidate with an explicit deployment file.

```sh
WORKBENCH_CONFIG=/absolute/path/deployment.json /absolute/path/node /absolute/path/tools/workbench/server.mjs
```

A deployment without models or modules can create local projects. It does not run AI stages.

```json
{
  "schemaVersion": "workbench-launch-v1",
  "server": {
    "port": 4181,
    "dbPath": "state/workbench.sqlite",
    "executionRoot": "state/executions",
    "maxConcurrentJobs": 2
  }
}
```

Paths resolve from the containing configuration file. The server listens only on `127.0.0.1`. Declared Codex executables must be absolute paths. The launcher does not execute a provider availability or authentication probe.

`textProviders` maps stable provider IDs to `{adapter,model,binary?,timeoutMs?}`. The fixed adapter is `codex-cli`. `bindings` maps the existing business binding keys to `{providerId,model,role}`. Provider IDs and models must match. Enabled module owners require their actual role bindings. Loading a model name does not implement another provider protocol or establish independent model diversity.

`moduleConfigs` accepts JSON pathnames or null for `reference`, `sketch`, `sketchReview`, `finalVisual`, `content`, and `layout`. Each existing module owns its startup parser. Its runtime still checks evidence, exact original assignments, human decisions and current inputs. Optional omissions disable that configuration.

`imageConfigPath` names the existing image adapter JSON. The launcher uses its owner parser and leaves credential resolution in the local image adapter. Put no credential value in deployment JSON. A valid declaration without its credential starts disabled. Image generation and edit verification remain `not_verified` until actual separate verification.

Deployment JSON is bounded to 64 KiB. Module JSON is bounded to 8 MiB each. Image JSON is bounded to 16 KiB. One load reads at most 16 MiB. The reader rejects nonregular files, leaf symlinks, duplicate JSON members, invalid UTF-8, changed reads and unknown fields. Invalid explicit configuration fails before opening the database.

Creative calibration and reference profile calibration declarations retain exact attribution and evidence paths. Startup does not verify their evidence bytes or grant review approval. Review and capability evidence paths resolve from their owning file. Historical receipts are not rewritten.

Layout execution declarations use the current `project-native-execution-v2` parser. The loader parses their identities without reading declared tools or installed dependency trees. It does not provide a new environment identity or authorize native export. The legacy factory still accepts its existing v1 contract when called directly. V1 layout declarations in the new deployment format are an explicit unsupported limitation.

Startup retains the existing runtime scans and queued work. Configuring an existing database can therefore advance previously authorized work. It does not create a task confirmation or human adoption. Unknown jobs and frozen-model mismatches stay blocked by their current owners. Back up and inspect the intended local database before enabling modules. This private candidate is not integrated into the main workbench.

Initial v3 content creation, final-review success/runtime, project-specific layout resources, the temporary native renderer location and heterogeneous per-role sketch-review capabilities remain separate work. The launcher does not fix or bypass them.
