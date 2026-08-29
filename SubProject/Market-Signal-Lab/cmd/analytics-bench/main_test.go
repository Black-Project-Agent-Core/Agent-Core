//go:build analyticsbench

package main

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunBenchmarkBlocksBeforePerformanceWhenRustWorkerMissing(t *testing.T) {
	var out bytes.Buffer
	code := runBenchmark([]string{"-worker", filepath.Join(t.TempDir(), "missing-worker")}, &out)
	if code != 2 {
		t.Fatalf("code=%d output=%s", code, out.String())
	}
	body := out.String()
	if !strings.Contains(body, `"status": "blocked"`) || !strings.Contains(body, "Rust parity gate") {
		t.Fatalf("output=%s", body)
	}
	if strings.Contains(body, `"benchmarks": [`) {
		t.Fatalf("performance must not be emitted before parity: %s", body)
	}
}
