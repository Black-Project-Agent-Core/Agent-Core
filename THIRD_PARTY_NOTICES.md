# Third-Party Notices

Agent Core includes implementation patterns adapted from the projects listed below.
These notices preserve the applicable MIT license and provenance for the transplanted components.

## Graft

Donor repository: `Black-Project-Agent-Core/Graft`
Donor commit: `65c29667bd59d7137caba8f6f5b5790e2d1f9404`
Donor tree: `fbfcd728b6ebe587678996b20053c81bfd4da3ad`

Adapted areas include working-tree freshness/fingerprinting, Git-visible source enumeration,
and provider-neutral contract patterns. Agent Core replaces donor-owned Git process invocation
with its existing GitHub/Git authority rather than importing the donor runtime.
MIT License

Copyright (c) 2026 Context Graph Engine contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
## codebase-memory-mcp

Donor repository: `Black-Project-Agent-Core/codebase-memory-mcp`
Donor commit: `4d8ac9e1cea0d645a02f876f47536c54a5bfa406`
Donor tree: `afccfb0e1d82ffb0690e01b19c9f7fd4ec446ad2`

Adapted areas include SHA-256 fingerprint identity and fail-closed identity verification.
Agent Core does not import the donor daemon, storage authority, or agent installation wiring.
MIT License

  Copyright (c) 2025 DeusData

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
