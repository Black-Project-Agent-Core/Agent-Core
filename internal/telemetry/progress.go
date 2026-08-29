package telemetry

import (
	"marketsignallab/internal/domain"
	"math"
	"sync"
	"time"
)

type ProgressTracker struct {
	mu          sync.RWMutex
	runID       string
	startedAt   time.Time
	stages      []domain.ScanStageSnapshot
	current     domain.ScanStage
	planned     int
	completed   int
	products    int
	requests    int
	requestPlan int
	warnings    int
	errors      int
}

func NewProgressTracker(runID string, stages []domain.ScanStage) *ProgressTracker {
	ss := make([]domain.ScanStageSnapshot, len(stages))
	for i, s := range stages {
		ss[i] = domain.ScanStageSnapshot{Stage: s, Status: domain.ScanStageWaiting}
	}
	return &ProgressTracker{runID: runID, stages: ss}
}
func (p *ProgressTracker) SetStartedAt(t time.Time) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.startedAt = t
}
func (p *ProgressTracker) SetPlannedWorkUnits(n int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if n > 0 {
		p.planned = n
	}
}
func (p *ProgressTracker) SetRequestsPlanned(n int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if n >= 0 {
		p.requestPlan = n
	}
}
func (p *ProgressTracker) AdvanceWorkUnits(delta int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if delta > 0 {
		p.completed += delta
	}
}
func (p *ProgressTracker) SetProductsDiscovered(n int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if n >= 0 {
		p.products = n
	}
}
func (p *ProgressTracker) SetRequestsCompleted(n int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if n >= 0 {
		p.requests = n
	}
}
func (p *ProgressTracker) StartStage(stage domain.ScanStage, at time.Time) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.current = stage
	for i := range p.stages {
		if p.stages[i].Stage == stage {
			p.stages[i].Status = domain.ScanStageRunning
			p.stages[i].StartedAt = at.UTC().Format(time.RFC3339)
		}
	}
}
func (p *ProgressTracker) CompleteStage(stage domain.ScanStage, at time.Time) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for i := range p.stages {
		if p.stages[i].Stage == stage {
			p.stages[i].Status = domain.ScanStageCompleted
			p.stages[i].CompletedAt = at.UTC().Format(time.RFC3339)
		}
	}
}
func (p *ProgressTracker) WarnStage(stage domain.ScanStage, at time.Time) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.warnings++
	for i := range p.stages {
		if p.stages[i].Stage == stage {
			p.stages[i].Warnings++
			if p.stages[i].Status == domain.ScanStageWaiting {
				p.stages[i].Status = domain.ScanStageWarning
			}
		}
	}
}
func (p *ProgressTracker) FailStage(stage domain.ScanStage, at time.Time) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.errors++
	for i := range p.stages {
		if p.stages[i].Stage == stage {
			p.stages[i].Errors++
			p.stages[i].Status = domain.ScanStageFailed
			p.stages[i].CompletedAt = at.UTC().Format(time.RFC3339)
		}
	}
}
func (p *ProgressTracker) Snapshot(now time.Time) domain.ScanRuntimeSnapshot {
	p.mu.RLock()
	defer p.mu.RUnlock()
	det := p.planned > 0
	pct := 0.0
	if det {
		pct = math.Round(math.Min(100, float64(p.completed)*100/float64(p.planned))*10) / 10
	}
	elapsed := int64(0)
	if !p.startedAt.IsZero() {
		elapsed = now.Sub(p.startedAt).Milliseconds()
		if elapsed < 0 {
			elapsed = 0
		}
	}
	return domain.ScanRuntimeSnapshot{RunID: p.runID, StartedAt: fmtTime(p.startedAt), UpdatedAt: now.UTC().Format(time.RFC3339), CurrentStage: p.current, Stages: append([]domain.ScanStageSnapshot(nil), p.stages...), PlannedWorkUnits: p.planned, CompletedWorkUnits: p.completed, ProgressDeterminate: det, ProgressPercent: pct, ProductsDiscovered: p.products, RequestsCompleted: p.requests, RequestsPlanned: p.requestPlan, ElapsedMs: elapsed, WarningCount: p.warnings, ErrorCount: p.errors}
}
func fmtTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}
