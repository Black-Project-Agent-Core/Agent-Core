package analyticsengine

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func buildFakeV2Worker(t *testing.T) string {
	t.Helper()
	name := "fake-worker-v2"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	out := filepath.Join(t.TempDir(), name)
	cmd := exec.Command("go", "build", "-o", out, "./testdata/fake_worker_v2.go")
	cmd.Dir = "."
	if b, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build fake worker: %v\n%s", err, b)
	}
	return out
}

func TestRustV2ClientStartRequiresSuccessfulHandshake(t *testing.T) {
	worker := buildFakeV2Worker(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	ok := NewRustV2Client(worker, time.Second)
	ok.args = []string{"normal"}
	if err := ok.Start(ctx); err != nil {
		t.Fatalf("normal handshake: %v", err)
	}
	defer ok.Close()
	h := ok.Health()
	if h.Status != EngineHealthy || h.Protocol != ProtocolV2 || h.Version != "fake-v2" {
		t.Fatalf("health=%+v", h)
	}

	mismatch := NewRustV2Client(worker, time.Second)
	mismatch.args = []string{"protocol-mismatch"}
	if err := mismatch.Start(ctx); err == nil || !strings.Contains(err.Error(), "protocol mismatch") {
		t.Fatalf("protocol mismatch err=%v", err)
	}
	if mismatch.Health().Status != EngineProtocolMismatch {
		t.Fatalf("mismatch health=%+v", mismatch.Health())
	}

	missing := NewRustV2Client(worker, time.Second)
	missing.args = []string{"missing-capability"}
	if err := missing.Start(ctx); err == nil || !strings.Contains(err.Error(), "missing required capability") {
		t.Fatalf("missing capability err=%v", err)
	}
	if missing.Health().Status != EngineProtocolMismatch {
		t.Fatalf("missing health=%+v", missing.Health())
	}

	_ = os.Remove(worker)
}

func TestRustV2ClientQueueIsOneActiveTwoWaiting(t *testing.T) {
	worker := buildFakeV2Worker(t)
	tracePath := filepath.Join(t.TempDir(), "trace.log")
	client := NewRustV2Client(worker, time.Second)
	client.args = []string{"slow-batch"}
	client.env = []string{"MSL_FAKE_WORKER_TRACE=" + tracePath}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	firstDone := make(chan error, 1)
	go func() { _, err := client.ExecuteBatch(context.Background(), testBatch(1)); firstDone <- err }()
	waitForTraceCount(t, tracePath, "analytics:", 1, time.Second)

	waiting := make([]chan error, 2)
	for i := 0; i < 2; i++ {
		waiting[i] = make(chan error, 1)
		go func(slot uint32, ch chan error) {
			_, err := client.ExecuteBatch(context.Background(), testBatch(slot))
			ch <- err
		}(uint32(i+2), waiting[i])
	}
	waitForQueueDepth(t, client, 2, time.Second)

	fourthCtx, fourthCancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer fourthCancel()
	if _, err := client.ExecuteBatch(fourthCtx, testBatch(4)); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("fourth caller err=%v", err)
	}
	if got := countTracePrefix(tracePath, "analytics:"); got != 1 {
		t.Fatalf("fourth caller reached worker while queue full; analytics requests=%d", got)
	}

	if err := <-firstDone; err != nil {
		t.Fatalf("first: %v", err)
	}
	for i, ch := range waiting {
		if err := <-ch; err != nil {
			t.Fatalf("waiting %d: %v", i, err)
		}
	}
}

func testBatch(slot uint32) AnalyticsBatch {
	return AnalyticsBatch{Operations: []BatchOperation{{SlotID: slot, OperationID: V2OpSelectionProbability, SchemaID: 1, Input: SelectionProbabilityInput{Observations: []SelectionObservation{{Weight: 1, Selected: true}}}}}}
}

func waitForQueueDepth(t *testing.T, client *RustV2Client, want int, max time.Duration) {
	t.Helper()
	deadline := time.Now().Add(max)
	for time.Now().Before(deadline) {
		if client.Metrics().QueueDepth == want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("queue depth=%d want=%d", client.Metrics().QueueDepth, want)
}

func waitForTraceCount(t *testing.T, path, prefix string, want int, max time.Duration) {
	t.Helper()
	deadline := time.Now().Add(max)
	for time.Now().Before(deadline) {
		if countTracePrefix(path, prefix) >= want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("trace %q count=%d want>=%d", prefix, countTracePrefix(path, prefix), want)
}

func countTracePrefix(path, prefix string) int {
	b, _ := os.ReadFile(path)
	count := 0
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, prefix) {
			count++
		}
	}
	return count
}

func TestRustV2ClientCanceledWaitingJobNeverReachesWorker(t *testing.T) {
	worker := buildFakeV2Worker(t)
	tracePath := filepath.Join(t.TempDir(), "trace.log")
	client := NewRustV2Client(worker, time.Second)
	client.args = []string{"slow-batch"}
	client.env = []string{"MSL_FAKE_WORKER_TRACE=" + tracePath}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	firstDone := make(chan error, 1)
	go func() { _, err := client.ExecuteBatch(context.Background(), testBatch(11)); firstDone <- err }()
	waitForTraceCount(t, tracePath, "analytics:", 1, time.Second)

	waitingCtx, waitingCancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer waitingCancel()
	if _, err := client.ExecuteBatch(waitingCtx, testBatch(12)); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("waiting caller err=%v", err)
	}

	thirdDone := make(chan error, 1)
	go func() { _, err := client.ExecuteBatch(context.Background(), testBatch(13)); thirdDone <- err }()
	if err := <-firstDone; err != nil {
		t.Fatalf("first: %v", err)
	}
	if err := <-thirdDone; err != nil {
		t.Fatalf("third: %v", err)
	}
	if got := countTracePrefix(tracePath, "analytics:"); got != 2 {
		t.Fatalf("canceled waiting job reached worker; analytics requests=%d want=2", got)
	}
}

func TestRustV2ClientActiveCancellationDrainsWithoutKillingWorker(t *testing.T) {
	worker := buildFakeV2Worker(t)
	tracePath := filepath.Join(t.TempDir(), "trace.log")
	client := NewRustV2Client(worker, time.Second)
	client.args = []string{"slow-batch"}
	client.env = []string{"MSL_FAKE_WORKER_TRACE=" + tracePath}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	activeCtx, activeCancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer activeCancel()
	activeDone := make(chan error, 1)
	go func() { _, err := client.ExecuteBatch(activeCtx, testBatch(21)); activeDone <- err }()
	waitForTraceCount(t, tracePath, "analytics:", 1, time.Second)
	if err := <-activeDone; !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("active caller err=%v", err)
	}

	nextDone := make(chan error, 1)
	go func() { _, err := client.ExecuteBatch(context.Background(), testBatch(22)); nextDone <- err }()
	time.Sleep(100 * time.Millisecond)
	if got := countTracePrefix(tracePath, "analytics:"); got != 1 {
		t.Fatalf("next job reached worker before canceled active response drained; requests=%d", got)
	}
	if err := <-nextDone; err != nil {
		t.Fatalf("next job must succeed on same worker after drain: %v", err)
	}
	if got := countTracePrefix(tracePath, "analytics:"); got != 2 {
		t.Fatalf("analytics requests=%d want=2", got)
	}
	if starts := countTracePrefix(tracePath, "start:"); starts != 1 {
		t.Fatalf("ordinary active cancellation restarted/killed worker; starts=%d", starts)
	}
}

func TestRustV2ClientHardFailureRestartsBeforeNextBatch(t *testing.T) {
	worker := buildFakeV2Worker(t)
	modes := []string{"hang", "exit", "malformed-response", "wrong-request-id"}
	for _, mode := range modes {
		t.Run(mode, func(t *testing.T) {
			tracePath := filepath.Join(t.TempDir(), "trace.log")
			failOncePath := filepath.Join(t.TempDir(), "failed.once")
			watchdog := 50 * time.Millisecond
			client := NewRustV2Client(worker, watchdog)
			client.args = []string{mode}
			client.env = []string{
				"MSL_FAKE_WORKER_TRACE=" + tracePath,
				"MSL_FAKE_WORKER_FAIL_ONCE=" + failOncePath,
			}
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if err := client.Start(ctx); err != nil {
				t.Fatal(err)
			}
			defer client.Close()

			_, firstErr := client.ExecuteBatch(ctx, testBatch(31))
			if firstErr == nil {
				t.Fatal("first batch must fail")
			}
			wantStatus := EngineInvalidResult
			switch mode {
			case "hang":
				wantStatus = EngineTimedOut
				if !strings.Contains(firstErr.Error(), "watchdog timeout") {
					t.Fatalf("hang error=%v", firstErr)
				}
			case "exit":
				wantStatus = EngineCrashed
			}
			if h := client.Health(); h.Status != wantStatus {
				t.Fatalf("failure health=%+v want status=%s", h, wantStatus)
			}
			if _, err := client.ExecuteBatch(ctx, testBatch(32)); err != nil {
				t.Fatalf("batch after hard failure must restart and succeed: %v", err)
			}
			if starts := countTracePrefix(tracePath, "start:"); starts != 2 {
				t.Fatalf("worker starts=%d want=2", starts)
			}
			if handshakes := countTracePrefix(tracePath, "handshake:"); handshakes != 2 {
				t.Fatalf("handshakes=%d want=2", handshakes)
			}
			if got := client.Metrics().WorkerRestartCount; got != 1 {
				t.Fatalf("restart count=%d want=1", got)
			}
			if h := client.Health(); h.Status != EngineHealthy || h.Protocol != ProtocolV2 {
				t.Fatalf("health after restart=%+v", h)
			}
		})
	}
}

func TestRustV2ClientHealthAndMetricsStayResponsiveDuringSlowBatch(t *testing.T) {
	worker := buildFakeV2Worker(t)
	tracePath := filepath.Join(t.TempDir(), "trace.log")
	client := NewRustV2Client(worker, time.Second)
	client.args = []string{"slow-batch"}
	client.env = []string{"MSL_FAKE_WORKER_TRACE=" + tracePath}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	done := make(chan error, 1)
	go func() { _, err := client.ExecuteBatch(context.Background(), testBatch(41)); done <- err }()
	waitForTraceCount(t, tracePath, "analytics:", 1, time.Second)
	waitForInFlight(t, client, true, time.Second)

	started := time.Now()
	h := client.Health()
	m := client.Metrics()
	elapsed := time.Since(started)
	if elapsed > 25*time.Millisecond {
		t.Fatalf("cached health/metrics blocked behind active analytics for %s", elapsed)
	}
	if h.Status != EngineHealthy || h.Protocol != ProtocolV2 {
		t.Fatalf("health=%+v", h)
	}
	if !m.InFlight {
		t.Fatalf("metrics=%+v", m)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func waitForInFlight(t *testing.T, client *RustV2Client, want bool, max time.Duration) {
	t.Helper()
	deadline := time.Now().Add(max)
	for time.Now().Before(deadline) {
		if client.Metrics().InFlight == want {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatalf("inFlight=%v want=%v", client.Metrics().InFlight, want)
}

func TestRetainV2BufferDropsOversizedCapacity(t *testing.T) {
	small := make([]byte, 1, 64<<20)
	if got := retainV2Buffer(small); got == nil || cap(got) != 64<<20 {
		t.Fatalf("64 MiB buffer should remain reusable; cap=%d", cap(got))
	}
	large := make([]byte, 1, (64<<20)+1)
	if got := retainV2Buffer(large); got != nil {
		t.Fatalf("buffer above 64 MiB retained with cap=%d", cap(got))
	}
}
