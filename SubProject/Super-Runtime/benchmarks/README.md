# Super-Runtime Hard Memory-Ceiling Harness

Status: Task 7 acceptance harness

`memory-ceiling.sh` runs one command inside a **real delegated cgroup-v2 memory controller**. It must never silently fall back to an unconstrained run.

## Enforcement contract

A supported host must allow the harness to create a child cgroup with writable:

```text
memory.max
memory.swap.max
cgroup.procs
memory.peak
memory.events
```

The harness:

1. creates a fresh child cgroup;
2. writes the requested byte ceiling to `memory.max`;
3. writes `0` to `memory.swap.max`;
4. starts the command in a stopped state;
5. moves that process into the child cgroup **before user code executes**;
6. resumes the command;
7. records cgroup `memory.peak`, sampled process `VmRSS`, exit status, and `memory.events` OOM evidence;
8. hashes stdout/stderr and optionally checks stdout SHA-256 parity;
9. kills any leftover descendants and removes the child cgroup.

If any enforcement prerequisite is unavailable, the harness exits `77` with `classification=unsupported` and does **not** execute the user command.

`systemd-run --user` is not required. The current build host lacks a user systemd bus, but it exposes a delegated cgroup-v2 hierarchy that is sufficient for real enforcement.

## Usage

Probe only:

```bash
benchmarks/memory-ceiling.sh --probe
```

Run a command under a hard ceiling:

```bash
benchmarks/memory-ceiling.sh \
  --limit-bytes 100663296 \
  --evidence-dir /tmp/super-runtime-memory-proof \
  -- command arg1 arg2
```

Add output parity:

```bash
benchmarks/memory-ceiling.sh \
  --limit-bytes 100663296 \
  --expect-sha256 <expected-stdout-sha256> \
  --evidence-dir /tmp/super-runtime-memory-proof \
  -- command arg1 arg2
```

The evidence directory contains:

```text
stdout.txt
stderr.txt
report.txt
```

## Classification / exit codes

```text
0   success
77  unsupported host / no real enforcement
78  invalid invocation
79  output parity failure
80  runtime command failure
81  cgroup OOM kill
```

OOM classification is based on the cgroup `memory.events` `oom_kill` delta, not merely an exit code such as `137`.

## Memory evidence

The report contains both:

```text
peak_cgroup_bytes
peak_rss_bytes
```

`peak_cgroup_bytes` comes from cgroup v2 `memory.peak` and is the authoritative evidence for the enforced memory ceiling. `peak_rss_bytes` is sampled from the command process's `/proc/<pid>/status` `VmRSS` and is observational only. They measure different accounting domains and can differ, especially around OOM and process teardown.

The hard-cap acceptance condition is therefore:

```text
real cgroup-v2 enforcement exists
AND memory.max == requested ceiling
AND memory.swap.max == 0
AND peak_cgroup_bytes <= requested ceiling
AND classification/output evidence is correct
```

## Self-test

```bash
benchmarks/test-memory-ceiling.sh
```

The self-test covers:

- supported-host probe;
- unsupported-host fail-closed behavior where the user command must not execute;
- successful bounded command + output SHA-256 parity;
- ordinary runtime failure classification;
- parity failure classification;
- deliberate OOM classification under a real cgroup ceiling.

## Fresh Task-7 build host evidence

On the Task-7 implementation host (`Linux 6.8.0-1052-azure`, AMD EPYC 7763), a success fixture under a 96 MiB ceiling produced:

```text
classification=success
limit_bytes=100663296
swap_max_bytes=0
peak_cgroup_bytes=11759616
process_exit_code=0
output_parity=PASS
```

A deliberate 256 MiB allocation under a 48 MiB ceiling produced:

```text
classification=oom
limit_bytes=50331648
swap_max_bytes=0
peak_cgroup_bytes=50331648
process_exit_code=137
oom_kill_delta=2
```

These numbers are host/run evidence, not universal performance expectations.
