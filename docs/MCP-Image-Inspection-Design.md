# External MCP image inspection

## Approved scope and source

Add one read-only `image_inspect` tool for external ChatGPT/Claude MCP controllers. No second AI/provider calls, Native runtime activation, UI changes, or changes to `read_file`. Inspired by [Claude's crop-tool cookbook](https://platform.claude.com/cookbook/multimodal-crop-tool): give the controller a bounded overview, then map displayed-pixel crop coordinates back to the full-resolution original. Cookbook benchmark results are not Agent Core verification.

## Contract

- `overview(path, format?, maxEdge?)` returns a real MCP image plus view ID, original oriented dimensions, displayed dimensions, digest, source rectangle, scale and coordinate convention.
- `crop(path, viewId, rectangle: {x,y,width,height}, format?, zoom?, maxEdge?)` uses absolute pixel-edge coordinates in that returned view. Top-left origin; right/bottom exclusive. Floor the mapped left/top and ceil right/bottom; retain separate x/y ratios after integer output sizing.
- Every crop rereads and validates the original through existing path and regular-file owners. Bind views to canonical path plus SHA-256 of original bytes; reject drift, foreign/expired views and out-of-bounds rectangles. Never crop an earlier downsampled output.
- Decode local 8-bit PNG/JPEG/WebP only, normalize all eight EXIF orientations, reject animations, remote URLs and other formats. Overview never upscales. Crop supports explicit zoom 1–16 (default 1), bounded by the same output limits, with deterministic cubic magnification/Lanczos3 reduction; it adds no source information. Never synthesize detail or silently change encoding. Both actions accept `maxEdge` 128–1536 (default1536) to lower output size explicitly; this also recovers an oversized overview before any view exists. Default PNG; explicit JPEG is lossy and reported as such.
- Bounds: 32 MiB compressed input, 24 million decoded pixels, 1536 longest output edge, 1.5 million output pixels, 2 MiB encoded output, 3 MiB serialized image-tool result; 64 metadata-only views per inspector scope, 15-minute expiry; two decodes process-wide, no queue. Sharp processing timeout 10 seconds, excluding libuv queue waiting and metadata reads. Output over budget fails with guidance to lower `maxEdge`/zoom, request a smaller crop or explicitly choose JPEG.
- The HTTP handler retains at most 32 inspector scopes in a 15-minute idle/LRU map across ephemeral per-POST MCP servers. Each scope is keyed by authenticated credential ID plus explicit `mcp-session-id`/`x-agent-core-session-id`. Headerless clients sharing one credential share a metadata-view namespace; use an explicit session header for conversation isolation. Missing credential IDs never share inspector state. Grants are rechecked by the existing owner on every request. Inspector view state is bounded and nonpersistent; metadata only, never source/output image buffers. Standard credential discovery and invocation grants apply exactly to `image_inspect`. Tool is not registered for Native tasks.
- Image bytes never enter history, evidence or result artifacts. Workspace omission remains stricter than metadata-only. Generic tool response budgets remain unchanged.

## Implementation and verification plan

1. Write failing focused image tests: original-resolution nested crops, explicit deterministic magnification, rounding, orientations, source drift/session/expiry, input safety and resource bounds.
2. Implement one image owner using installed sharp plus existing path/regular-file helpers, no new dependencies.
3. In parallel, test and integrate MCP registration, grant denial, image-specific transport budget and metadata-only persistence.
4. Run targeted tests and standard build/path guard. Independently review the diff, resolve findings, update CODEBASE and minor release intent. Do not apply release, deploy, activate runtime or publish until parent coordinates documentation integration.

## Review focus

Path races and symlink escape; orientation before extraction; nested crops never using resized pixels; base64 counted in transport budget; tiny images also absent from persisted history. Client-side image transformations remain outside this server's control: coordinates must refer to dimensions explicitly returned by this tool.

### Platform boundary for image file validation

Image inspection snapshots canonical ancestor directory identities, rejects new symlink ancestors, and rechecks the opened file and parents before returning bytes. Linux additionally checks the kernel's opened-descriptor target through `/proc/self/fd`; missing access fails closed. On Windows and other platforms, Node does not provide the same final-handle path primitive here. Those platforms retain Agent Core's existing trusted-local-workspace assumption: untrusted processes must not concurrently replace ancestor directories. Parent rechecks detect observed drift but do not claim complete adversarial race resistance. No native addon or system/security setting was introduced; Windows runtime acceptance remains unperformed.

## Verified source state — 2026-10-08

- Focused run: 95/95 tests across image owner, in-memory MCP, authenticated legacy/modern HTTP, result budget, invocation evidence, credential grants, schema contract, safe-file and existing Memory host integration (9 files). Real HTTP verification includes two-call view reuse, current grants, revoked credentials, changed allowlists, cross-credential/session isolation, LRU/expiry and byte-exact PNG delivery above 256 KiB.
- Standard `npm run build` passes, including path policy, Memory build and TypeScript; diff whitespace check is clean. Full repository suite and Windows/live external-client acceptance were not run.
- Independent reviews identified and drove fixes for exact-edge crop rounding, interpolation labeling and actual HTTP view lifetime. Path handling is bounded by the platform assumptions above; review does not establish model accuracy or eliminate that documented Windows trust requirement.
- Minor release intent is present. `release:check-intent -- --json` cannot validate it because this clone lacks `refs/agent-core/current-line-baseline`; no baseline was invented. No release application, runtime activation, deployment, production credential/grant change or paid-model call occurred.
