package telemetry

import (
	"errors"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/repository"
	"sort"
	"strings"
	"sync"
	"time"
)

type activeRuntime struct {
	run        domain.MarketMapRun
	compat     domain.RuntimeCompatibility
	tracker    *ProgressTracker
	seq        int64
	subs       map[chan domain.ScanTelemetryEvent]struct{}
	unitDur    []time.Duration
	reqLat     []time.Duration
	retryDelay time.Duration
	retryCount int
	stageStart map[domain.ScanStage]time.Time
	stageDur   map[string]int64
}
type Recorder struct {
	mu     sync.RWMutex
	repo   repository.TelemetryRepository
	now    func() time.Time
	active map[string]*activeRuntime
}

func NewRecorder(repo repository.TelemetryRepository, now func() time.Time) *Recorder {
	if now == nil {
		now = time.Now
	}
	return &Recorder{repo: repo, now: now, active: map[string]*activeRuntime{}}
}
func (r *Recorder) Begin(run domain.MarketMapRun, compat domain.RuntimeCompatibility, planned int) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.active[run.ID]; ok {
		return errors.New("telemetry run already active")
	}
	st := parseTime(run.StartedAt)
	if st.IsZero() {
		st = r.now()
	}
	p := NewProgressTracker(run.ID, domain.CanonicalScanStages())
	p.SetStartedAt(st)
	p.SetPlannedWorkUnits(planned)
	p.SetRequestsPlanned(run.RequestsUsed)
	run.Status = domain.MarketMapRunRunning
	r.active[run.ID] = &activeRuntime{run: run, compat: compat, tracker: p, subs: map[chan domain.ScanTelemetryEvent]struct{}{}, stageStart: map[domain.ScanStage]time.Time{}, stageDur: map[string]int64{}}
	return nil
}

func (r *Recorder) Configure(runID string, compat domain.RuntimeCompatibility, planned, requestsPlanned int) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	a := r.active[runID]
	if a == nil {
		return errors.New("telemetry run not active")
	}
	a.compat = compat
	a.tracker.SetPlannedWorkUnits(planned)
	a.tracker.SetRequestsPlanned(requestsPlanned)
	return nil
}

func (r *Recorder) SetRunStatus(runID string, status domain.MarketMapRunStatus) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if a := r.active[runID]; a != nil {
		a.run.Status = status
	}
}

func (r *Recorder) Emit(runID string, event domain.ScanTelemetryEvent) error {
	r.mu.Lock()
	a := r.active[runID]
	if a == nil {
		r.mu.Unlock()
		return errors.New("telemetry run not active")
	}
	a.seq++
	event.RunID = runID
	event.Sequence = a.seq
	if event.At == "" {
		event.At = r.now().UTC().Format(time.RFC3339)
	}
	subs := make([]chan domain.ScanTelemetryEvent, 0, len(a.subs))
	for ch := range a.subs {
		subs = append(subs, ch)
	}
	r.mu.Unlock()
	if err := r.repo.AppendScanTelemetryEvent(event); err != nil {
		return err
	}
	for _, ch := range subs {
		select {
		case ch <- event:
		default:
		}
	}
	return nil
}
func (r *Recorder) Snapshot(runID string) (domain.ScanRuntimeSnapshot, bool) {
	r.mu.RLock()
	a := r.active[runID]
	if a == nil {
		r.mu.RUnlock()
		return domain.ScanRuntimeSnapshot{}, false
	}
	now := r.now()
	snap := a.tracker.Snapshot(now)
	snap.Status = a.run.Status
	snap.RuntimeCompatibility = a.compat
	snap.LastSequence = a.seq
	cur := append([]time.Duration(nil), a.unitDur...)
	lat := append([]time.Duration(nil), a.reqLat...)
	retry := a.retryDelay
	compat := a.compat
	r.mu.RUnlock()
	hist, _ := r.repo.ScanRuntimeSummaries()
	comp := []domain.ScanRuntimeSummary{}
	for _, h := range hist {
		if RuntimeCompatibilityScore(compat, h.Compatibility) >= .9 {
			comp = append(comp, h)
		}
	}
	snap.ETA = EstimateRemaining(EstimateInput{Now: now, StartedAt: parseTime(snap.StartedAt), PlannedWorkUnits: snap.PlannedWorkUnits, CompletedWorkUnits: snap.CompletedWorkUnits, CurrentUnitDurations: cur, CurrentRequestLatencies: lat, RetryDelay: retry, ComparableRuns: comp})
	return snap, true
}
func (r *Recorder) Subscribe(runID string) (<-chan domain.ScanTelemetryEvent, func(), error) {
	r.mu.Lock()
	a := r.active[runID]
	if a == nil {
		r.mu.Unlock()
		return nil, nil, errors.New("telemetry run not active")
	}
	ch := make(chan domain.ScanTelemetryEvent, 64)
	a.subs[ch] = struct{}{}
	r.mu.Unlock()
	once := sync.Once{}
	cancel := func() {
		once.Do(func() {
			r.mu.Lock()
			if x := r.active[runID]; x != nil {
				if _, ok := x.subs[ch]; ok {
					delete(x.subs, ch)
					close(ch)
				}
			}
			r.mu.Unlock()
		})
	}
	return ch, cancel, nil
}
func (r *Recorder) Finalize(runID string, status domain.MarketMapRunStatus) (domain.ScanRuntimeSummary, error) {
	r.mu.Lock()
	a := r.active[runID]
	if a == nil {
		r.mu.Unlock()
		return domain.ScanRuntimeSummary{}, errors.New("telemetry run not active")
	}
	now := r.now()
	a.run.Status = status
	snap := a.tracker.Snapshot(now)
	sum := domain.ScanRuntimeSummary{RunID: runID, Status: status, StartedAt: snap.StartedAt, CompletedAt: now.UTC().Format(time.RFC3339), DurationMs: snap.ElapsedMs, PlannedWorkUnits: snap.PlannedWorkUnits, CompletedWorkUnits: snap.CompletedWorkUnits, ProductsDiscovered: snap.ProductsDiscovered, RequestsCompleted: snap.RequestsCompleted, RetryCount: a.retryCount, RetryDelayMs: a.retryDelay.Milliseconds(), WarningCount: snap.WarningCount, ErrorCount: snap.ErrorCount, StageDurationMs: a.stageDur, Compatibility: a.compat}
	if len(a.reqLat) > 0 {
		ms := make([]float64, len(a.reqLat))
		for i, d := range a.reqLat {
			ms[i] = float64(d.Milliseconds())
		}
		sort.Float64s(ms)
		sum.AverageLatencyMs = avg(ms)
		sum.P50LatencyMs = percentile(ms, .5)
		sum.P95LatencyMs = percentile(ms, .95)
	}
	subs := make([]chan domain.ScanTelemetryEvent, 0, len(a.subs))
	for ch := range a.subs {
		subs = append(subs, ch)
	}
	delete(r.active, runID)
	r.mu.Unlock()
	if err := r.repo.SaveScanRuntimeSummary(sum); err != nil {
		return sum, err
	}
	for _, ch := range subs {
		close(ch)
	}
	return sum, nil
}
func (r *Recorder) StartStage(runID string, stage domain.ScanStage) error {
	now := r.now()
	r.mu.Lock()
	a := r.active[runID]
	if a == nil {
		r.mu.Unlock()
		return errors.New("telemetry run not active")
	}
	a.stageStart[stage] = now
	a.tracker.StartStage(stage, now)
	r.mu.Unlock()
	return r.Emit(runID, domain.ScanTelemetryEvent{Stage: stage, Severity: domain.TelemetryInfo, Code: "stage_started", MessageKey: "telemetry.stage_started"})
}
func (r *Recorder) CompleteStage(runID string, stage domain.ScanStage) error {
	now := r.now()
	r.mu.Lock()
	a := r.active[runID]
	if a == nil {
		r.mu.Unlock()
		return errors.New("telemetry run not active")
	}
	if st, ok := a.stageStart[stage]; ok {
		a.stageDur[string(stage)] += now.Sub(st).Milliseconds()
	}
	a.tracker.CompleteStage(stage, now)
	r.mu.Unlock()
	return r.Emit(runID, domain.ScanTelemetryEvent{Stage: stage, Severity: domain.TelemetryInfo, Code: "stage_completed", MessageKey: "telemetry.stage_completed"})
}
func (r *Recorder) Advance(runID string, delta, products, requests int, duration time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if a := r.active[runID]; a != nil {
		a.tracker.AdvanceWorkUnits(delta)
		if products >= 0 {
			a.tracker.SetProductsDiscovered(products)
		}
		if requests >= 0 {
			a.tracker.SetRequestsCompleted(requests)
		}
		if duration > 0 {
			a.unitDur = append(a.unitDur, duration)
		}
	}
}
func (r *Recorder) RecordRequest(runID string, latency time.Duration, retry int, retryDelay time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if a := r.active[runID]; a != nil {
		if latency > 0 {
			a.reqLat = append(a.reqLat, latency)
		}
		a.retryCount += retry
		a.retryDelay += retryDelay
	}
}
func (r *Recorder) Warn(runID string, stage domain.ScanStage, code, detail string) error {
	r.mu.Lock()
	if a := r.active[runID]; a != nil {
		a.tracker.WarnStage(stage, r.now())
	}
	r.mu.Unlock()
	return r.Emit(runID, domain.ScanTelemetryEvent{Stage: stage, Severity: domain.TelemetryWarning, Code: code, MessageKey: "telemetry." + code, Detail: detail})
}
func (r *Recorder) Fail(runID string, stage domain.ScanStage, code, detail string) error {
	r.mu.Lock()
	if a := r.active[runID]; a != nil {
		a.tracker.FailStage(stage, r.now())
	}
	r.mu.Unlock()
	return r.Emit(runID, domain.ScanTelemetryEvent{Stage: stage, Severity: domain.TelemetryError, Code: code, MessageKey: "telemetry." + code, Detail: detail})
}
func parseTime(s string) time.Time { t, _ := time.Parse(time.RFC3339, strings.TrimSpace(s)); return t }
func avg(xs []float64) float64 {
	var s float64
	for _, v := range xs {
		s += v
	}
	if len(xs) == 0 {
		return 0
	}
	return s / float64(len(xs))
}
func percentile(xs []float64, p float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	i := int(float64(len(xs)-1) * p)
	if i < 0 {
		i = 0
	}
	if i >= len(xs) {
		i = len(xs) - 1
	}
	return xs[i]
}
