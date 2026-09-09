package telemetry

import (
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"reflect"
	"testing"
	"time"
)

func TestRecorderSequencesPersistsAndFinalizes(t *testing.T) {
	s, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(100, 0)
	r := NewRecorder(s, func() time.Time { return now })
	run := domain.MarketMapRun{ID: "r1", Status: domain.MarketMapRunRunning, StartedAt: now.UTC().Format(time.RFC3339)}
	if err := r.Begin(run, domain.RuntimeCompatibility{PlannerVersion: "p"}, 10); err != nil {
		t.Fatal(err)
	}
	ch, cancel, err := r.Subscribe("r1")
	if err != nil {
		t.Fatal(err)
	}
	defer cancel()
	if err := r.Emit("r1", domain.ScanTelemetryEvent{Code: "hello", Detail: "safe"}); err != nil {
		t.Fatal(err)
	}
	select {
	case ev := <-ch:
		if ev.Sequence != 1 {
			t.Fatalf("%+v", ev)
		}
	case <-time.After(time.Second):
		t.Fatal("no event")
	}
	snap, ok := r.Snapshot("r1")
	if !ok || snap.RunID != "r1" {
		t.Fatalf("%+v %v", snap, ok)
	}
	now = now.Add(10 * time.Second)
	sum, err := r.Finalize("r1", domain.MarketMapRunCompleted)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Status != domain.MarketMapRunCompleted || sum.DurationMs != 10000 {
		t.Fatalf("%+v", sum)
	}
	rows, total, err := s.ScanTelemetryEvents("r1", 0, 10)
	if err != nil || total != 1 || rows[0].Sequence != 1 {
		t.Fatalf("rows=%+v total=%d err=%v", rows, total, err)
	}
}

func TestRecorderHasNoSecretStorageAPIAndPersistsPreRedactedDetail(t *testing.T) {
	if _, ok := reflect.TypeOf(activeRuntime{}).FieldByName("secret"); ok {
		t.Fatal("activeRuntime still stores a secret")
	}
	if _, ok := reflect.TypeOf((*Recorder)(nil)).MethodByName("SetSecret"); ok {
		t.Fatal("Recorder still exposes SetSecret")
	}

	s, _ := storage.Open(t.TempDir())
	r := NewRecorder(s, time.Now)
	run := domain.MarketMapRun{ID: "r", StartedAt: time.Now().UTC().Format(time.RFC3339), Status: domain.MarketMapRunRunning}
	_ = r.Begin(run, domain.RuntimeCompatibility{}, 1)
	_, cancel, _ := r.Subscribe("r")
	defer cancel()
	const safeDetail = "[redacted]"
	for i := 0; i < 200; i++ {
		if err := r.Emit("r", domain.ScanTelemetryEvent{Code: "e", Detail: safeDetail}); err != nil {
			t.Fatal(err)
		}
	}
	rows, _, _ := s.ScanTelemetryEvents("r", 0, 300)
	for _, ev := range rows {
		if ev.Detail != safeDetail {
			t.Fatalf("caller-provided safe detail changed: %q", ev.Detail)
		}
	}
}
