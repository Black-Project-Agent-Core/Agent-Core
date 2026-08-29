package app

import (
	"marketsignallab/internal/domain"
	"marketsignallab/internal/security"
	"sync"
	"time"
)

type CapturePreview struct {
	ID        string                       `json:"id"`
	Payload   domain.SurfaceCapturePayload `json:"payload"`
	CreatedAt string                       `json:"createdAt"`
	ExpiresAt string                       `json:"expiresAt"`
}

type CapturePreviewStore struct {
	mu   sync.Mutex
	now  func() time.Time
	ttl  time.Duration
	rows map[string]CapturePreview
}

func NewCapturePreviewStore(now func() time.Time, ttl time.Duration) *CapturePreviewStore {
	if now == nil {
		now = time.Now
	}
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	return &CapturePreviewStore{now: now, ttl: ttl, rows: map[string]CapturePreview{}}
}
func (s *CapturePreviewStore) purgeExpiredLocked() {
	now := s.now().UTC()
	for id, row := range s.rows {
		exp, err := time.Parse(time.RFC3339, row.ExpiresAt)
		if err != nil || !exp.After(now) {
			delete(s.rows, id)
		}
	}
}
func (s *CapturePreviewStore) Put(p domain.SurfaceCapturePayload) (string, error) {
	if err := security.ValidateCapturePayload(p); err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.purgeExpiredLocked()
	now := s.now().UTC()
	id := domain.NewID()
	s.rows[id] = CapturePreview{ID: id, Payload: p, CreatedAt: now.Format(time.RFC3339), ExpiresAt: now.Add(s.ttl).Format(time.RFC3339)}
	return id, nil
}
func (s *CapturePreviewStore) Get(id string) (CapturePreview, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.purgeExpiredLocked()
	v, ok := s.rows[id]
	return v, ok
}
func (s *CapturePreviewStore) Delete(id string) { s.mu.Lock(); defer s.mu.Unlock(); delete(s.rows, id) }
func (s *CapturePreviewStore) Take(id string) (CapturePreview, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.purgeExpiredLocked()
	v, ok := s.rows[id]
	if ok {
		delete(s.rows, id)
	}
	return v, ok
}
