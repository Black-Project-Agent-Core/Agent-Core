# Incident postmortem: delegated Skill approval lost at HTTP factory

Status: RESOLVED (historical recovery independently exercised again 2026-10-29).
Severity: local feature unavailable; no demonstrated data loss or credential exposure.
Owner: Agent Core MCP transport and Main engineering controller.
Source: [original incident and resident evidence](native-chat-reasoning-effort.md), especially “User-authorized approval-policy extension” and “First activation and recovery”.

This retrospective applies active `incident-postmortem` revision
`sha256:479334c2c90b1bbb16c6be2ef81af60ada010c3e52768fecc315e561c245dc74`.
It does not claim this Skill caused the original recovery or measured a new benefit.

## Stabilization and timeline

| Time (UTC) | Observation and source |
| --- | --- |
| 2026-10-28, before 14:54:22 | Operator-provisioned credential/workspace allowance returned allowed=true, foreign-workspace=false and other-principal=false. The original report does not supply an exact provisioning timestamp. |
| 2026-10-28 14:54:22.542 | First activated Core started (PID 11592, historical identity); later health was ok and build stale=false. The first 61-second readiness observation had expired, so the launcher receipt alone was not accepted as proof. |
| After first activation, before 15:07:02 | Live promotion returned `SKILL_PROPOSAL_CONTROLLER_NOT_AUTHORIZED` before a decision/catalog mutation. Exact failure time is not recorded in the narrative source. Main preserved that failure and traced the authenticated HTTP path. |
| Same bounded recovery interval | Main restored the omitted `proposalDecisionAuthorizer` option through `src/mcp/handler.ts` and exercised an authenticated HTTP regression covering MCP factory forwarding. This is source-reported historical work, supported by the named regression and later activation. |
| 2026-10-28 15:07:02.024 | Recovery Core started (PID 20472, historical identity); health ok/build current were read back. This was a second official activation, so the original one-restart target was not met. |
| 2026-10-28 15:08:24.490 | Exact security proposal approval was recorded through the real delegated-controller path; source report contains its deterministic `controller-decision:` reference. |
| 2026-10-29, this task | `tests/trusted-proposal-http.test.ts` plus Skill discovery tool tests passed 10/10. The HTTP test authenticates, binds the task/workspace, approves the exact revision, then revokes allowance and verifies refusal; a forged principal argument cannot replace the host principal. |

## Contributing conditions

- Trigger: live delegated promotion used the authenticated HTTP adapter after activation.
- Enabling condition: an explicit factory-options projection omitted the authorizer already wired at the outer application boundary. The downstream gate correctly refused missing authority.
- Detection gap: direct service tests covered the decision branch while bypassing the HTTP factory seam. They did not prove production option propagation.
- Separate confounder: the initial readiness window expired before Core became ready. Later health disproved “no running Core”; this did not explain the missing callback.

The evidence supports a transport-forwarding cause for this incident. It does not support blaming a person, weakening authentication, or treating all future authorization errors as the same bug.

## Impact and completed actions

One local capability was unavailable during the recovery interval. The refused operation did not approve or activate a Skill. No loss/corruption is demonstrated; total user delay and a precise failure timestamp remain unknown.

| Action | Owner | Role | Verification |
| --- | --- | --- | --- |
| Forward the typed authorizer through the MCP HTTP factory | MCP handler | Prevent recurrence | Current source plus authenticated HTTP regression. |
| Test allowance, revocation, exact revision/task binding and forged principal input through HTTP | Auth/MCP integration | Detect regression | `tests/trusted-proposal-http.test.ts` passed in this task. |
| Activate through the official owner and read health independently | Launcher/runtime | Mitigate stale resident state | Historical second-activation receipt and health in the original report. |
| Preserve initial failure and the extra restart | Main documentation/Learning | Preserve diagnosis limits | Original report and reviewed recovery checkpoint; no fabricated user messages. |

## Reuse runbook

1. On `SKILL_PROPOSAL_CONTROLLER_NOT_AUTHORIZED`, stop the approval attempt and inspect the actual current episode/task, workspace and host principal without exposing credentials.
2. Verify live allowance/key validity using the existing auth owner. If current episode is absent after transport rotation, reconnect the same stable taskKey before another exact request.
3. If allowance/task are valid, compare the service path with the authenticated HTTP factory. Keep refusal intact while locating the missing propagation or scope mismatch.
4. Apply only the verified owner correction; preserve unrelated source changes and exact proposal revisions. Never replace external origin with a fabricated Native user message.
5. Run the authenticated regression, build affected owners, activate through the official lifecycle when required, then read health and the exact canonical proposal/artifact independently.
6. Roll back a source/build change using its reviewed checkpoint or retained owner build if it regresses. Preserve decisions/history; do not delete records or disable auth to recover availability.

## Acceptance limits

The example includes a sourced timeline, trigger/enabling/detection conditions, impact, verified actions and a bounded runbook. Historical missing timestamps are explicit. A failed production request before the forwarding fix and passing authenticated checks afterward are recorded separately. The current task repeats the regression check; it does not replay a production promotion or prove general incident-handling benefit.
