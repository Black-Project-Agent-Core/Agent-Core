package storage

import (
	"encoding/json"
	"marketsignallab/internal/domain"
	"sort"
)

const (
	savedViewsFile = "saved_views.jsonl"
	watchlistFile  = "watchlist.jsonl"
)

func (s *Store) AppendSavedView(v domain.SavedView) error { return s.appendJSONL(savedViewsFile, v) }

func (s *Store) SavedViews() ([]domain.SavedView, error) {
	latest := map[string]domain.SavedView{}
	err := s.readJSONL(savedViewsFile, func(b []byte) error {
		var v domain.SavedView
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		latest[v.ID] = v
		return nil
	})
	out := make([]domain.SavedView, 0, len(latest))
	for _, v := range latest {
		if !v.Deleted {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].UpdatedAt != out[j].UpdatedAt {
			return out[i].UpdatedAt > out[j].UpdatedAt
		}
		return out[i].ID < out[j].ID
	})
	return out, err
}

func (s *Store) SavedViewByID(id string) (domain.SavedView, bool, error) {
	var found domain.SavedView
	ok := false
	err := s.readJSONL(savedViewsFile, func(b []byte) error {
		var v domain.SavedView
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if v.ID == id {
			found, ok = v, true
		}
		return nil
	})
	if found.Deleted {
		ok = false
	}
	return found, ok, err
}

func (s *Store) AppendWatchlistEntry(v domain.WatchlistEntry) error {
	return s.appendJSONL(watchlistFile, v)
}

func (s *Store) WatchlistEntries() ([]domain.WatchlistEntry, error) {
	latest := map[string]domain.WatchlistEntry{}
	err := s.readJSONL(watchlistFile, func(b []byte) error {
		var v domain.WatchlistEntry
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		latest[v.ID] = v
		return nil
	})
	out := make([]domain.WatchlistEntry, 0, len(latest))
	for _, v := range latest {
		if !v.Deleted {
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].UpdatedAt != out[j].UpdatedAt {
			return out[i].UpdatedAt > out[j].UpdatedAt
		}
		return out[i].ID < out[j].ID
	})
	return out, err
}

func (s *Store) WatchlistEntryByID(id string) (domain.WatchlistEntry, bool, error) {
	var found domain.WatchlistEntry
	ok := false
	err := s.readJSONL(watchlistFile, func(b []byte) error {
		var v domain.WatchlistEntry
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if v.ID == id {
			found, ok = v, true
		}
		return nil
	})
	if found.Deleted {
		ok = false
	}
	return found, ok, err
}
