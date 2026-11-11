# Synthetic project evaluation fixture

`project-evaluation-synthetic.json.gz` contains the complete JSON.stringify serialization of one synthetic backend project at revision 58. It contains 15 jobs, three artifacts, a committed strategy owner edge, two owner reports, and the research authority history required by that edge.

This is a pure-domain regression fixture. It is not proof of current file access, actual model execution, customer approval, or consumer research. The persisted paths are opaque historical strings from temporary synthetic fixtures. The tests call synchronous domain functions and do not open those payload paths, contact providers, or start services. Existing executor tests separately verify actual managed-file bytes before and after dispatch and at release.

The uncompressed bytes have SHA-256 `ccbd5a29d6e069031a6634f4bd3b8883f83be57212f530ae83eeed2553327bb8` and length 4,416,513. The deterministic gzip has SHA-256 `3b2b3fba089972d080a67b5a1d5fe1f1342e23574f52101d5d991b3f19099bcd` and length 361,673. Its timestamp is zero. No project records were removed or modified. A recursive field-name scan found no API-key, password, secret, access-token, or refresh-token fields. Hashes, execution IDs, and source paths preserve the original synthetic provenance bindings.

The test asserts a committed owner outcome and behavior after public mutations. It does not freeze the full projectView schema or inspect private cache hits. An intentional authority-contract change may require a newly executed synthetic fixture. Do not rewrite old receipt hashes merely to keep this fixture passing.

Run the durable regression from the repository root with `node --test tools/workbench/project-evaluation.test.mjs`. The test needs only the repository source and this fixture. It does not depend on `.scratch` or a retained temporary snapshot.
