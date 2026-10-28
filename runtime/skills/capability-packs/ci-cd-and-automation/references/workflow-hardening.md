# Hardening GitHub Actions workflows

Agent Core addition, not upstream text. The examples in the main Skill show what a pipeline does. This file lists what to add when you write or review a workflow so that a compromised dependency, a hostile pull request or a runaway job does limited damage. Check an existing workflow against each rule. Applies to the user's projects; use the platform's current documentation for exact syntax before relying on a detail.

## 1. Least privilege for the token

Set the default permissions to read at the top, then raise per job only where needed.

```yaml
permissions:
  contents: read

jobs:
  release:
    permissions:
      contents: write      # only this job writes
```

Without a `permissions` block the token may carry broader default rights, depending on the repository setting.

## 2. Concurrency for jobs that write

```yaml
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false   # a deploy must finish; use true for PR checks
```

## 3. A time limit on every job

```yaml
jobs:
  test:
    timeout-minutes: 20
```

A hung job otherwise runs to the platform maximum and burns minutes.

## 4. Pin third-party actions to a full commit SHA

```yaml
- uses: some-org/some-action@0123456789abcdef0123456789abcdef01234567  # v2.3.1
```

A tag can be moved to different code. A 40-character SHA cannot. Actions published by the platform owner itself may use a tag if you accept that trade-off; third-party ones should not. Update pins through a reviewed change, not by hand-editing to a newer SHA you did not read.

## 5. `pull_request_target` and `workflow_run`

These run with the base repository's token and secrets even for pull requests from forks. Never check out and run code from the pull request in such a workflow (no build, no test, no script from the PR). If you need the PR's files, treat them as data to read. Prefer plain `pull_request`, which gives fork PRs a read-only token and no secrets. Gate `workflow_run` jobs that write on the conclusion, the triggering event and the branch.

## 6. Untrusted values go through `env:`

Pull request titles, branch names, issue bodies and commit messages are attacker-controlled text. Never place `${{ github.event.* }}` inside a `run:` script, where it becomes code.

```yaml
- name: Show title
  env:
    TITLE: ${{ github.event.pull_request.title }}
  run: Write-Host "Title: $env:TITLE"      # pwsh; in bash: echo "Title: $TITLE"
```

Windows runners use PowerShell as the default shell in `run:` steps, so quoting rules differ; set `shell:` explicitly when it matters.

## 7. Short-lived credentials

Prefer OpenID Connect federation to the cloud provider over a long-lived secret stored in the repository. Grant `id-token: write` only to the job that exchanges the token. Do not expose secrets to jobs that run fork code. Do not raise the log level to a mode that prints request headers.

## 8. Gates come from the verdict

- A required check passes because the verdict says pass, not because a step ended. A step that errored before producing a verdict is an infrastructure error, not a pass and not a policy failure. Keep the three apart (pass, fail, unavailable) in the job summary.
- Upload evidence even when the job fails: `if: always()` on the artifact step, with a short `retention-days`.
- `continue-on-error: true` hides failures from the gate; use it only on steps whose result you separately check.

## Checklist for reviewing a workflow

- Top-level `permissions` present and read-only?
- Every job has `timeout-minutes`?
- Writing or deploying jobs have `concurrency`?
- No tag-only third-party actions?
- No `pull_request_target` job that runs PR code?
- No `${{ github.event.* }}` inside `run:`?
- Secrets reach only the jobs that need them; none reach fork PRs?
- Self-hosted runners are not used for public repositories?

The Agent Core repository itself has no workflows; this file is for the projects the user builds with Agent Core.
