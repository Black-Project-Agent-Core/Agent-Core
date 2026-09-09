package app

import (
	"context"
	"errors"
	"marketsignallab/internal/domain"
	"sync"
	"time"
)

type AutopilotRunManager struct {
	mu       sync.Mutex
	svc      *Service
	activeID string
}

func NewAutopilotRunManager(svc *Service) *AutopilotRunManager { return &AutopilotRunManager{svc: svc} }

func (m *AutopilotRunManager) activeConflictLocked() (domain.ScanRuntimeSnapshot, bool) {
	if m.activeID == "" {
		return domain.ScanRuntimeSnapshot{}, false
	}
	if snap, ok := m.svc.telemetry.Snapshot(m.activeID); ok {
		return snap, true
	}
	m.activeID = ""
	return domain.ScanRuntimeSnapshot{}, false
}

func (m *AutopilotRunManager) Start(mode domain.MarketMapMode) (domain.ScanRuntimeSnapshot, error) {
	m.mu.Lock()
	if snap, active := m.activeConflictLocked(); active {
		m.mu.Unlock()
		return snap, errors.New("market autopilot run already active")
	}
	m.mu.Unlock()

	token, err := m.svc.resolvedEnvatoToken()
	if err != nil {
		return domain.ScanRuntimeSnapshot{}, err
	}
	defer func() { token = "" }()

	m.mu.Lock()
	if snap, active := m.activeConflictLocked(); active {
		m.mu.Unlock()
		return snap, errors.New("market autopilot run already active")
	}
	runID := domain.NewID()
	started := time.Now().UTC()
	_ = m.svc.telemetry.Begin(domain.MarketMapRun{ID: runID, Status: domain.MarketMapRunRunning, StartedAt: started.Format(time.RFC3339)}, domain.RuntimeCompatibility{}, 0)
	m.activeID = runID
	m.mu.Unlock()

	secret := token
	go func() {
		_, _ = m.svc.runMarketAutopilotWithID(context.Background(), secret, mode, runID)
		secret = ""
		m.mu.Lock()
		if m.activeID == runID {
			m.activeID = ""
		}
		m.mu.Unlock()
	}()
	snap, _ := m.svc.telemetry.Snapshot(runID)
	return snap, nil
}

func (m *AutopilotRunManager) Active() (domain.ScanRuntimeSnapshot, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.activeConflictLocked()
}
