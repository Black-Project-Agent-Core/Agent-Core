package analyticsengine

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func buildFakeWorker(t *testing.T) string {
	t.Helper()
	name := "fake-worker"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	out := filepath.Join(t.TempDir(), name)
	if err := exec.Command("go", "build", "-o", out, "./testdata/fake_worker.go").Run(); err != nil {
		t.Fatalf("build fake worker: %v", err)
	}
	return out
}

func TestRustClientStartCallAndClose(t *testing.T) {
	path := buildFakeWorker(t)
	client := NewRustClient(path, 2*time.Second)
	if err := client.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := client.Health(); got.Status != EngineHealthy || got.Protocol != ProtocolV1 {
		t.Fatalf("health=%+v", got)
	}
	var result DistributionSimilarityResult
	if _, err := client.Call(context.Background(), OpDistributionSimilarity, DistributionSimilarityInput{A: map[string]float64{"a": 1}, B: map[string]float64{"b": 1}}, &result); err != nil {
		t.Fatal(err)
	}
	if result.Score != 42.5 {
		t.Fatalf("result=%+v", result)
	}
	if err := client.Close(); err != nil {
		t.Fatal(err)
	}
	if got := client.Health(); got.Status != EngineUnavailable {
		t.Fatalf("health after close=%+v", got)
	}
}

func TestRustClientRejectsMismatchedResponseID(t *testing.T) {
	path := buildFakeWorker(t)
	client := NewRustClient(path, time.Second)
	client.env = append(os.Environ(), "FAKE_WORKER_MODE=mismatch_id")
	if err := client.StartWithoutHandshake(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	var result map[string]any
	if _, err := client.Call(context.Background(), OpCapabilities, map[string]any{}, &result); err == nil || !strings.Contains(err.Error(), "response_id_mismatch") {
		t.Fatalf("err=%v", err)
	}
}

func TestRustClientRejectsMalformedResponse(t *testing.T) {
	path := buildFakeWorker(t)
	client := NewRustClient(path, time.Second)
	client.env = append(os.Environ(), "FAKE_WORKER_MODE=malformed")
	if err := client.StartWithoutHandshake(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	var result map[string]any
	if _, err := client.Call(context.Background(), OpCapabilities, map[string]any{}, &result); err == nil {
		t.Fatal("malformed response must fail")
	}
}

func TestRustClientTimeoutKillsWorker(t *testing.T) {
	path := buildFakeWorker(t)
	client := NewRustClient(path, 50*time.Millisecond)
	client.env = append(os.Environ(), "FAKE_WORKER_MODE=hang")
	if err := client.StartWithoutHandshake(context.Background()); err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if _, err := client.Call(context.Background(), OpCapabilities, map[string]any{}, &result); err == nil || !strings.Contains(err.Error(), "timeout") {
		t.Fatalf("err=%v", err)
	}
	if got := client.Health(); got.Status == EngineHealthy {
		t.Fatalf("worker should not remain healthy: %+v", got)
	}
	_ = client.Close()
}

func TestRustClientExitSanitizesDiagnostic(t *testing.T) {
	path := buildFakeWorker(t)
	client := NewRustClient(path, time.Second)
	client.env = append(os.Environ(), "FAKE_WORKER_MODE=exit")
	if err := client.StartWithoutHandshake(context.Background()); err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	_, err := client.Call(context.Background(), OpCapabilities, map[string]any{}, &result)
	if err == nil {
		t.Fatal("worker exit must fail")
	}
	diagnostic := client.LastDiagnostic()
	if strings.Contains(diagnostic, "fake-secret-token") {
		t.Fatalf("secret leaked: %q", diagnostic)
	}
	if !strings.Contains(diagnostic, "[redacted]") {
		t.Fatalf("redaction missing: %q", diagnostic)
	}
	_ = client.Close()
}

func TestRustClientLineLimitSupportsOneMillionObservationParityCorpus(t *testing.T) {
	corpus := BuildDeterministicCorpus(1_000_000)
	input, err := json.Marshal(corpus.Selection)
	if err != nil {
		t.Fatal(err)
	}
	wire, err := json.Marshal(ProtocolRequest{Protocol: ProtocolV1, ID: "req-million", Op: OpSelectionProbability, Input: input})
	if err != nil {
		t.Fatal(err)
	}
	if len(wire) <= 1<<20 {
		t.Fatalf("fixture unexpectedly small: %d", len(wire))
	}
	if len(wire)+1 > maxWorkerLineBytes {
		t.Fatalf("1M corpus request=%d exceeds transport limit=%d", len(wire)+1, maxWorkerLineBytes)
	}
}

func TestRustClientWorkerOutlivesStartupContext(t *testing.T) {
	path := buildFakeWorker(t)
	client := NewRustClient(path, 2*time.Second)
	ctx, cancel := context.WithCancel(context.Background())
	if err := client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	cancel()
	defer client.Close()

	var result DistributionSimilarityResult
	if _, err := client.Call(context.Background(), OpDistributionSimilarity, DistributionSimilarityInput{A: map[string]float64{"a": 1}, B: map[string]float64{"b": 1}}, &result); err != nil {
		t.Fatalf("worker died with startup context: %v", err)
	}
	if result.Score != 42.5 {
		t.Fatalf("result=%+v", result)
	}
}
