# security-change-review

Nama: security-change-review
Status: proposed
Aksi: create
Artifact: not-built
Workspace: agent-core
Artifact digest: unavailable
Target active digest: none
Proposal ID: skill-proposal:7139318df258635fa966e6dd52eec98c
Revisi: sha256:3340e246653231cef3af36daad8d24bce4d5acf0d7fe0db59e58433f0db87952
Kualifikasi bukti: awaiting-verification
Berkas ini adalah proposal, bukan instruksi aktif atau izin eksekusi.

## Tujuan
Review a code change for security defects by tracing attacker-controlled values to sinks in the current code, trying to refute each suspicion before reporting it, and validating what survives from three angles.

## Trigger
Reviewing a diff, branch or pull request that touches input parsing, authentication, file or path handling, process spawning, network requests, deserialization, cryptography or secrets.
Asked whether a specific change introduced a vulnerability, or to audit a recently written feature for security.
Triaging a reported finding to decide whether it is real.

## Non-trigger
General code quality review with no security question: choose code-review-and-quality.
Hardening guidance while writing new code: choose security-and-hardening.
Reviewing documentation, formatting or comment-only changes.

## Workflow
1. Scope: list the changed files and name each trust boundary the change touches (input parsing, auth, path, process, network, deserialization, crypto, secrets, output encoding). A change that touches none is reported as out of scope, not as secure.
2. Hypothesis: write each suspicion as source, sink and the claim that a controlled value reaches the sink. Trace it hop by hop in the current code, naming file and line for every hop; the diff alone is not enough.
3. Refute first: look for the guard that already stops it (validation, allow-list, escaping, permission check, framework default). A suspicion with a guard on the path is dropped unless you can show how the guard is bypassed.
4. Validate what survives from three angles: reachability (who can supply the value and with what privilege), impact (the concrete harm: data read, data written, code execution, denial), and evidence (a demonstrating input or test, or the plain statement that it was not demonstrated).
5. Check the patterns reviews often miss: path traversal through .. and absolute paths and Windows alternate data streams and short names; request forgery through redirects and DNS; argument injection through values that start with -; regular expressions with nested quantifiers; deserializing untrusted data; secrets written to logs; a check and its use separated in time; a guard that fails open when it throws; look-alike or bidirectional Unicode in names; archive entries that escape the target folder.
6. Report each finding with its severity and why, its evidence level (demonstrated, traced or suspected), the smallest fix and the regression test that would fail before the fix. List what was not examined. Never state that no vulnerabilities exist; state what was checked.
7. Keep review and repair separate unless asked to do both; a fix needs a test that fails before and passes after.

## Alat yang dideklarasikan (bukan izin)

## Manfaat yang diharapkan; belum diukur
Findings that name a traced path and an evidence level, fewer false alarms where a guard already exists, and fewer missed classic patterns. Not measured; an expectation until reviews that used the Skill are compared.

## Bukti dan pengalaman asal
Task sumber: ext-3d1852634c8149468a39c6dbe21b140a
Dukungan terverifikasi: 
Kegagalan: 
Historical/unknown: ext-3d1852634c8149468a39c6dbe21b140a

## Keterbatasan
A method, not a scanner: it does not replace running the project's own analysis tools.
Depth is bounded by how much of the code the reviewer can actually read in the task.
Does not grant execution authority.

## Kebutuhan implementasi
A new Skill pack at runtime/skills/capability-packs/security-change-review/SKILL.md written through SkillService after an explicit user decision, with an optional references/commonly-missed-patterns.md of at most 8192 bytes.

## Acceptance yang direncanakan
SKILL.md passes the strict parser and node scripts/verify/skill-pack-lint.mjs reports no error and a Non-triggers text not shared with other packs.
A review of a known vulnerable fixture change names the traced path and an evidence level.
Activation happens only after a user decision recorded by the host for the exact revision.

## Keputusan pengguna
Belum ada keputusan atas revisi ini.

## Riwayat revisi
