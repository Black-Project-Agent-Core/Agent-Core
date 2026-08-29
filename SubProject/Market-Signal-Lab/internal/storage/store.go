package storage

import (
	"bufio"
	"encoding/json"
	"errors"
	"marketsignallab/internal/domain"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

type Store struct {
	root                        string
	mu                          sync.Mutex
	uniqueIDIndexes             map[string]*ledgerIDIndex
	productSnapshotIndex        *productSnapshotReadIndex
	productEntityIndex          *productEntityReadIndex
	liveMetadataIndex           *liveMetadataReadIndex
	productObservationIndex     *ledgerRowsReadIndex[domain.ProductObservation]
	productReleaseIndex         *productReleaseReadIndex
	productReleaseConflictIndex *ledgerRowsReadIndex[domain.ProductReleaseConflict]
	productTrendEventIndex      *ledgerRowsReadIndex[domain.ProductTrendEvent]
}

func Open(root string) (*Store, error) {
	store, _, err := OpenWithPurgeReport(root)
	return store, err
}

func OpenWithPurgeReport(root string) (*Store, PurgeReport, error) {
	for _, d := range []string{"history", "cache", "config", "exports", "logs"} {
		if err := os.MkdirAll(filepath.Join(root, d), 0755); err != nil {
			return nil, PurgeReport{}, err
		}
	}
	store := &Store{root: root, uniqueIDIndexes: make(map[string]*ledgerIDIndex)}
	report, err := store.RunMigrations()
	if err != nil {
		return nil, report, err
	}
	return store, report, nil
}
func (s *Store) Root() string { return s.root }
func (s *Store) appendJSONL(name string, v any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, err := os.OpenFile(filepath.Join(s.root, "history", name), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = f.Write(append(b, '\n'))
	return err
}
func (s *Store) readJSONL(name string, fn func([]byte) error) error {
	f, err := os.Open(filepath.Join(s.root, "history", name))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024), 10*1024*1024)
	for sc.Scan() {
		if strings.TrimSpace(sc.Text()) == "" {
			continue
		}
		if err := fn(sc.Bytes()); err != nil {
			return err
		}
	}
	return sc.Err()
}
func (s *Store) SaveIdentity(v domain.MarketIdentity) error {
	return s.appendJSONL("identities.jsonl", v)
}
func (s *Store) Identities() ([]domain.MarketIdentity, error) {
	out := []domain.MarketIdentity{}
	seen := map[string]bool{}
	err := s.readJSONL("identities.jsonl", func(b []byte) error {
		var v domain.MarketIdentity
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if !seen[v.ID] {
			out = append(out, v)
			seen[v.ID] = true
		}
		return nil
	})
	return out, err
}
func (s *Store) AppendAnalysis(v domain.Analysis) error { return s.appendJSONL("analyses.jsonl", v) }
func (s *Store) Analyses(id string) ([]domain.Analysis, error) {
	out := []domain.Analysis{}
	err := s.readJSONL("analyses.jsonl", func(b []byte) error {
		var v domain.Analysis
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if v.IdentityID == id {
			out = append(out, v)
		}
		return nil
	})
	sort.SliceStable(out, func(i, j int) bool { return out[i].AsOf < out[j].AsOf })
	return out, err
}
func (s *Store) LatestAnalysis(id string) (domain.Analysis, bool, error) {
	xs, err := s.Analyses(id)
	if err != nil {
		return domain.Analysis{}, false, err
	}
	if len(xs) == 0 {
		return domain.Analysis{}, false, nil
	}
	return xs[len(xs)-1], true, nil
}
func (s *Store) AppendBenchmark(v domain.Benchmark) error {
	return s.appendJSONL("benchmarks.jsonl", v)
}
func (s *Store) Benchmarks(id string) ([]domain.Benchmark, error) {
	out := []domain.Benchmark{}
	err := s.readJSONL("benchmarks.jsonl", func(b []byte) error {
		var v domain.Benchmark
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if v.IdentityID == id {
			out = append(out, v)
		}
		return nil
	})
	return out, err
}
func (s *Store) LatestBenchmark(id string) (domain.Benchmark, bool, error) {
	xs, err := s.Benchmarks(id)
	if err != nil {
		return domain.Benchmark{}, false, err
	}
	if len(xs) == 0 {
		return domain.Benchmark{}, false, nil
	}
	return xs[len(xs)-1], true, nil
}
func (s *Store) AppendComparison(v domain.Comparison) error {
	return s.appendJSONL("comparisons.jsonl", v)
}
func (s *Store) AppendResearchMetric(v domain.ResearchMetric) error {
	return s.appendJSONL("research_metrics.jsonl", v)
}

func (s *Store) AppendEvidence(v domain.EvidenceRecord) error {
	return s.appendJSONL("evidence.jsonl", v)
}
func (s *Store) Evidence(id string) ([]domain.EvidenceRecord, error) {
	out := []domain.EvidenceRecord{}
	err := s.readJSONL("evidence.jsonl", func(b []byte) error {
		var v domain.EvidenceRecord
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if id == "" || v.IdentityID == id {
			out = append(out, v)
		}
		return nil
	})
	sort.SliceStable(out, func(i, j int) bool { return out[i].ObservedAt < out[j].ObservedAt })
	return out, err
}
