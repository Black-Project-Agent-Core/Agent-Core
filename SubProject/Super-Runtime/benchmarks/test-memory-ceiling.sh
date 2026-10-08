#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
HARNESS="$HERE/memory-ceiling.sh"

fail() {
  echo "memory-ceiling self-test: FAIL: $*" >&2
  exit 1
}

[[ -x "$HARNESS" ]] || fail "missing executable harness: $HARNESS"

set +e
probe_out="$($HARNESS --probe 2>&1)"
probe_rc=$?
set -e
[[ $probe_rc -eq 0 ]] || fail "current host was expected to support delegated cgroup-v2 enforcement, rc=$probe_rc output=$probe_out"
grep -q '^enforcement_backend=cgroup-v2-delegated$' <<<"$probe_out" || fail "probe did not report delegated cgroup-v2"

work="$(mktemp -d /tmp/super-runtime-memory-ceiling-test-XXXXXX)"
trap 'rm -rf "$work"' EXIT

unsupported_marker="$work/unsupported-command-ran"
set +e
SUPER_RUNTIME_CGROUP_ROOT="$work/no-cgroup" "$HARNESS" --limit-bytes $((64 * 1024 * 1024)) --evidence-dir "$work/unsupported" -- \
  bash -c "touch '$unsupported_marker'" >"$work/unsupported.report" 2>"$work/unsupported.err"
unsupported_rc=$?
set -e
[[ $unsupported_rc -eq 77 ]] || fail "unsupported host path rc=$unsupported_rc"
[[ ! -e "$unsupported_marker" ]] || fail "unsupported host path executed the user command"
grep -q '^classification=unsupported$' "$work/unsupported.report" || fail "unsupported classification missing"

expected_line='super-runtime-memory-ceiling-ok'
expected_hash="$(printf '%s\n' "$expected_line" | sha256sum | awk '{print $1}')"

success_dir="$work/success"
mkdir -p "$success_dir"
set +e
"$HARNESS" --limit-bytes $((96 * 1024 * 1024)) --expect-sha256 "$expected_hash" --evidence-dir "$success_dir" -- \
  python3 -c 'x=bytearray(8*1024*1024); print("super-runtime-memory-ceiling-ok")' >"$work/success.report" 2>"$work/success.err"
success_rc=$?
set -e
[[ $success_rc -eq 0 ]] || fail "success fixture rc=$success_rc stderr=$(cat "$work/success.err")"
[[ ! -s "$work/success.err" ]] || fail "success harness emitted unexpected stderr: $(cat "$work/success.err")"
grep -q '^classification=success$' "$work/success.report" || fail "success classification missing"
grep -q '^output_parity=PASS$' "$work/success.report" || fail "output parity did not pass"
grep -q "^stdout_sha256=$expected_hash$" "$work/success.report" || fail "stdout hash mismatch"
grep -q '^swap_max_bytes=0$' "$work/success.report" || fail "swap was not disabled"
grep -q '^process_exit_code=0$' "$work/success.report" || fail "success process exit code not recorded"
peak="$(awk -F= '$1=="peak_cgroup_bytes"{print $2}' "$work/success.report")"
[[ "$peak" =~ ^[0-9]+$ && "$peak" -gt 0 && "$peak" -le $((96 * 1024 * 1024)) ]] || fail "invalid success peak_cgroup_bytes=$peak"
[[ -s "$success_dir/stdout.txt" ]] || fail "success stdout artifact missing"
[[ -f "$success_dir/stderr.txt" ]] || fail "success stderr artifact missing"

runtime_dir="$work/runtime-failure"
mkdir -p "$runtime_dir"
set +e
"$HARNESS" --limit-bytes $((96 * 1024 * 1024)) --evidence-dir "$runtime_dir" -- \
  bash -c 'echo runtime-failure; exit 7' >"$work/runtime.report" 2>"$work/runtime.err"
runtime_rc=$?
set -e
[[ $runtime_rc -eq 80 ]] || fail "runtime failure harness rc=$runtime_rc"
grep -q '^classification=runtime_failure$' "$work/runtime.report" || fail "runtime failure classification missing"
grep -q '^process_exit_code=7$' "$work/runtime.report" || fail "runtime process exit code missing"

parity_dir="$work/parity-failure"
mkdir -p "$parity_dir"
set +e
"$HARNESS" --limit-bytes $((96 * 1024 * 1024)) --expect-sha256 "$(printf '0%.0s' {1..64})" --evidence-dir "$parity_dir" -- \
  printf '%s\n' "$expected_line" >"$work/parity.report" 2>"$work/parity.err"
parity_rc=$?
set -e
[[ $parity_rc -eq 79 ]] || fail "parity failure harness rc=$parity_rc"
grep -q '^classification=parity_failure$' "$work/parity.report" || fail "parity failure classification missing"
grep -q '^output_parity=FAIL$' "$work/parity.report" || fail "parity failure evidence missing"

oom_dir="$work/oom"
mkdir -p "$oom_dir"
set +e
"$HARNESS" --limit-bytes $((48 * 1024 * 1024)) --evidence-dir "$oom_dir" -- \
  python3 -c 'x=bytearray(256*1024*1024); print(len(x))' >"$work/oom.report" 2>"$work/oom.err"
oom_rc=$?
set -e
[[ $oom_rc -eq 81 ]] || fail "OOM harness rc=$oom_rc stderr=$(cat "$work/oom.err")"
grep -q '^classification=oom$' "$work/oom.report" || fail "OOM classification missing"
oom_delta="$(awk -F= '$1=="oom_kill_delta"{print $2}' "$work/oom.report")"
[[ "$oom_delta" =~ ^[0-9]+$ && "$oom_delta" -ge 1 ]] || fail "OOM kill delta not observed: $oom_delta"
oom_peak="$(awk -F= '$1=="peak_cgroup_bytes"{print $2}' "$work/oom.report")"
[[ "$oom_peak" =~ ^[0-9]+$ && "$oom_peak" -gt 0 && "$oom_peak" -le $((48 * 1024 * 1024)) ]] || fail "invalid OOM peak_cgroup_bytes=$oom_peak"

echo "memory-ceiling self-test: PASS"
