#!/usr/bin/env bash
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

EXIT_UNSUPPORTED=77
EXIT_USAGE=78
EXIT_PARITY=79
EXIT_RUNTIME=80
EXIT_OOM=81
CGROUP_ROOT="${SUPER_RUNTIME_CGROUP_ROOT:-/sys/fs/cgroup}"

usage() {
  cat >&2 <<'EOF'
Usage:
  memory-ceiling.sh --probe
  memory-ceiling.sh --limit-bytes N --evidence-dir DIR [--expect-sha256 HEX] -- command [args...]

Exit codes:
  0   success
  77  unsupported host / no real enforcement
  78  invalid invocation
  79  output parity failure
  80  runtime command failure
  81  cgroup OOM kill
EOF
}

is_uint() {
  [[ "${1:-}" =~ ^[0-9]+$ ]]
}

is_sha256() {
  [[ "${1:-}" =~ ^[0-9a-fA-F]{64}$ ]]
}

probe_delegated_cgroup_v2() {
  [[ "$(uname -s 2>/dev/null)" == "Linux" ]] || return 1
  [[ -f "$CGROUP_ROOT/cgroup.controllers" ]] || return 1
  grep -qw memory "$CGROUP_ROOT/cgroup.controllers" || return 1
  [[ -w "$CGROUP_ROOT" ]] || return 1
  [[ -w "$CGROUP_ROOT/cgroup.subtree_control" ]] || return 1
  grep -qw memory "$CGROUP_ROOT/cgroup.subtree_control" || return 1

  local probe="$CGROUP_ROOT/sr-probe-${BASHPID:-$$}-${RANDOM}"
  mkdir "$probe" 2>/dev/null || return 1
  local ok=0
  if [[ -w "$probe/memory.max" && -w "$probe/memory.swap.max" && -w "$probe/cgroup.procs" && -r "$probe/memory.peak" && -r "$probe/memory.events" ]]; then
    ok=1
  fi
  rmdir "$probe" 2>/dev/null || true
  [[ $ok -eq 1 ]]
}

probe_report() {
  if probe_delegated_cgroup_v2; then
    echo "classification=supported"
    echo "enforcement_backend=cgroup-v2-delegated"
    echo "swap_control=available"
    return 0
  fi
  echo "classification=unsupported"
  echo "enforcement_backend=none"
  echo "reason=no_writable_delegated_cgroup_v2_memory_controller"
  return "$EXIT_UNSUPPORTED"
}

if [[ "${1:-}" == "--probe" ]]; then
  if [[ $# -ne 1 ]]; then
    usage
    exit "$EXIT_USAGE"
  fi
  probe_report
  exit $?
fi

limit_bytes=""
evidence_dir=""
expected_sha=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit-bytes)
      [[ $# -ge 2 ]] || { usage; exit "$EXIT_USAGE"; }
      limit_bytes="$2"; shift 2 ;;
    --evidence-dir)
      [[ $# -ge 2 ]] || { usage; exit "$EXIT_USAGE"; }
      evidence_dir="$2"; shift 2 ;;
    --expect-sha256)
      [[ $# -ge 2 ]] || { usage; exit "$EXIT_USAGE"; }
      expected_sha="${2,,}"; shift 2 ;;
    --)
      shift
      break ;;
    *)
      usage
      exit "$EXIT_USAGE" ;;
  esac
done

if ! is_uint "$limit_bytes" || [[ "$limit_bytes" -eq 0 ]] || [[ -z "$evidence_dir" ]] || [[ $# -eq 0 ]]; then
  usage
  exit "$EXIT_USAGE"
fi
if [[ -n "$expected_sha" ]] && ! is_sha256 "$expected_sha"; then
  usage
  exit "$EXIT_USAGE"
fi
if ! probe_delegated_cgroup_v2; then
  probe_report
  exit "$EXIT_UNSUPPORTED"
fi

mkdir -p "$evidence_dir" || exit "$EXIT_USAGE"
evidence_dir="$(cd "$evidence_dir" && pwd -P)"
stdout_file="$evidence_dir/stdout.txt"
stderr_file="$evidence_dir/stderr.txt"
report_file="$evidence_dir/report.txt"
: > "$stdout_file"
: > "$stderr_file"

cg="$CGROUP_ROOT/sr-bench-${BASHPID:-$$}-${RANDOM}"
pid=""
cleanup() {
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  if [[ -d "$cg" ]]; then
    if [[ -w "$cg/cgroup.kill" ]] && [[ -s "$cg/cgroup.procs" ]]; then
      echo 1 > "$cg/cgroup.kill" 2>/dev/null || true
      for _ in $(seq 1 100); do
        [[ ! -s "$cg/cgroup.procs" ]] && break
        sleep 0.01
      done
    fi
    rmdir "$cg" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

mkdir "$cg" 2>/dev/null || {
  echo "classification=unsupported"
  echo "enforcement_backend=none"
  echo "reason=unable_to_create_delegated_child_cgroup"
  exit "$EXIT_UNSUPPORTED"
}

if ! echo "$limit_bytes" > "$cg/memory.max" 2>/dev/null; then
  echo "classification=unsupported"
  echo "enforcement_backend=none"
  echo "reason=unable_to_set_memory_max"
  exit "$EXIT_UNSUPPORTED"
fi
if ! echo 0 > "$cg/memory.swap.max" 2>/dev/null; then
  echo "classification=unsupported"
  echo "enforcement_backend=none"
  echo "reason=unable_to_disable_swap"
  exit "$EXIT_UNSUPPORTED"
fi
if [[ -w "$cg/memory.oom.group" ]]; then
  echo 1 > "$cg/memory.oom.group" 2>/dev/null || true
fi

actual_limit="$(cat "$cg/memory.max")"
actual_swap="$(cat "$cg/memory.swap.max")"
if [[ "$actual_limit" != "$limit_bytes" || "$actual_swap" != "0" ]]; then
  echo "classification=unsupported"
  echo "enforcement_backend=none"
  echo "reason=cgroup_limit_verification_failed"
  exit "$EXIT_UNSUPPORTED"
fi

oom_before="$(awk '$1=="oom_kill"{print $2}' "$cg/memory.events")"
[[ -n "$oom_before" ]] || oom_before=0

command_sha256="$({ printf '%s\0' "$@"; } | sha256sum | awk '{print $1}')"
start_ns="$(date +%s%N)"

# The child stops itself before exec so the harness can move it into the bounded
# cgroup before any user command executes.
bash -c 'kill -STOP $$; exec "$@"' bash "$@" >"$stdout_file" 2>"$stderr_file" &
pid=$!

stopped=0
for _ in $(seq 1 1000); do
  if [[ ! -r "/proc/$pid/status" ]]; then
    break
  fi
  state="$(awk '/^State:/{print $2}' "/proc/$pid/status" 2>/dev/null || true)"
  if [[ "$state" == "T" || "$state" == "t" ]]; then
    stopped=1
    break
  fi
  sleep 0.002
done
if [[ $stopped -ne 1 ]]; then
  echo "classification=runtime_failure"
  echo "enforcement_backend=cgroup-v2-delegated"
  echo "reason=child_did_not_stop_before_exec"
  exit "$EXIT_RUNTIME"
fi

if ! echo "$pid" > "$cg/cgroup.procs" 2>/dev/null; then
  echo "classification=unsupported"
  echo "enforcement_backend=none"
  echo "reason=unable_to_move_process_into_cgroup"
  exit "$EXIT_UNSUPPORTED"
fi

membership="$(awk -F: '$1=="0"{print $3}' "/proc/$pid/cgroup" 2>/dev/null || true)"
if [[ "$membership" != "/$(basename "$cg")" ]]; then
  echo "classification=unsupported"
  echo "enforcement_backend=none"
  echo "reason=process_cgroup_membership_verification_failed"
  exit "$EXIT_UNSUPPORTED"
fi

peak_rss_bytes=0
kill -CONT "$pid"
while kill -0 "$pid" 2>/dev/null; do
  rss_kib="$(awk '/^VmRSS:/{print $2}' "/proc/$pid/status" 2>/dev/null || true)"
  if is_uint "$rss_kib"; then
    rss_bytes=$((rss_kib * 1024))
    if (( rss_bytes > peak_rss_bytes )); then
      peak_rss_bytes=$rss_bytes
    fi
  fi
  sleep 0.002
done

set +e
wait "$pid"
process_rc=$?
set -e 2>/dev/null || true
pid=""
end_ns="$(date +%s%N)"
duration_ms=$(( (end_ns - start_ns) / 1000000 ))

peak_cgroup_bytes="$(cat "$cg/memory.peak")"
oom_after="$(awk '$1=="oom_kill"{print $2}' "$cg/memory.events")"
[[ -n "$oom_after" ]] || oom_after=0
oom_delta=$((oom_after - oom_before))
stdout_sha="$(sha256sum "$stdout_file" | awk '{print $1}')"
stderr_sha="$(sha256sum "$stderr_file" | awk '{print $1}')"
stdout_bytes="$(wc -c < "$stdout_file" | tr -d ' ')"
stderr_bytes="$(wc -c < "$stderr_file" | tr -d ' ')"

output_parity="NOT_REQUESTED"
if [[ -n "$expected_sha" ]]; then
  if [[ "$stdout_sha" == "$expected_sha" ]]; then
    output_parity="PASS"
  else
    output_parity="FAIL"
  fi
fi

classification="success"
harness_rc=0
if (( oom_delta > 0 )); then
  classification="oom"
  harness_rc=$EXIT_OOM
elif (( process_rc != 0 )); then
  classification="runtime_failure"
  harness_rc=$EXIT_RUNTIME
elif [[ "$output_parity" == "FAIL" ]]; then
  classification="parity_failure"
  harness_rc=$EXIT_PARITY
fi

kernel="$(uname -sr | tr ' ' '_')"
cpu_model="$(awk -F': ' '/model name/{print $2; exit}' /proc/cpuinfo 2>/dev/null | tr ' ' '_' || true)"
repo_root="$(git -C "$(dirname "$HERE")" rev-parse --show-toplevel 2>/dev/null || true)"
repo_commit="unknown"
if [[ -n "$repo_root" ]]; then
  repo_commit="$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"
fi

cat > "$report_file" <<EOF
classification=$classification
enforcement_backend=cgroup-v2-delegated
limit_bytes=$limit_bytes
swap_max_bytes=$actual_swap
peak_cgroup_bytes=$peak_cgroup_bytes
peak_rss_bytes=$peak_rss_bytes
process_exit_code=$process_rc
oom_kill_delta=$oom_delta
stdout_sha256=$stdout_sha
stderr_sha256=$stderr_sha
stdout_bytes=$stdout_bytes
stderr_bytes=$stderr_bytes
expected_sha256=${expected_sha:-none}
output_parity=$output_parity
duration_ms=$duration_ms
kernel=$kernel
cpu_model=${cpu_model:-unknown}
repo_commit=$repo_commit
command_sha256=$command_sha256
EOF

cat "$report_file"
exit "$harness_rc"
