package storage

import (
	"encoding/json"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/universe"
	"sort"
)

const (
	catalogSnapshotsFile = "catalog_snapshots.jsonl"
	productSnapshotsFile = "product_snapshots.jsonl"
)

func (s *Store) AppendCatalogSnapshot(v domain.CatalogSnapshot) error {
	return s.appendJSONL(catalogSnapshotsFile, v)
}

func (s *Store) AppendCatalogSnapshots(rows []domain.CatalogSnapshot) error {
	return appendJSONLBatch(s, catalogSnapshotsFile, rows)
}

func (s *Store) CatalogSnapshots(filter domain.CatalogSnapshotFilter) ([]domain.CatalogSnapshot, error) {
	var nodes []domain.CatalogNode
	var err error
	if filter.ParentID != "" {
		nodes, err = s.CatalogNodes()
		if err != nil {
			return nil, err
		}
	}
	latest := map[string]domain.CatalogSnapshot{}
	err = s.readJSONL(catalogSnapshotsFile, func(b []byte) error {
		var v domain.CatalogSnapshot
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if filter.CatalogID != "" && v.CatalogID != filter.CatalogID {
			return nil
		}
		if filter.ParentID != "" && !universe.IsCatalogWithin(nodes, filter.ParentID, v.CatalogID) {
			return nil
		}
		if filter.WindowDays > 0 && v.Window.Days != filter.WindowDays {
			return nil
		}
		if filter.AsOf != "" && v.Window.CurrentEnd != filter.AsOf {
			return nil
		}
		if filter.ModelVersion != "" && v.ModelVersion != filter.ModelVersion {
			return nil
		}
		latest[v.ID] = v
		return nil
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.CatalogSnapshot, 0, len(latest))
	for _, v := range latest {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Window.CurrentEnd != out[j].Window.CurrentEnd {
			return out[i].Window.CurrentEnd < out[j].Window.CurrentEnd
		}
		if out[i].CatalogID != out[j].CatalogID {
			return out[i].CatalogID < out[j].CatalogID
		}
		return out[i].ModelVersion < out[j].ModelVersion
	})
	return out, nil
}

func (s *Store) LatestCatalogSnapshot(filter domain.CatalogSnapshotFilter) (domain.CatalogSnapshot, bool, error) {
	xs, err := s.CatalogSnapshots(filter)
	if err != nil {
		return domain.CatalogSnapshot{}, false, err
	}
	if len(xs) == 0 {
		return domain.CatalogSnapshot{}, false, nil
	}
	return xs[len(xs)-1], true, nil
}

func (s *Store) AppendProductSnapshot(v domain.ProductSnapshot) error {
	return s.appendJSONL(productSnapshotsFile, v)
}

func (s *Store) AppendProductSnapshots(rows []domain.ProductSnapshot) error {
	return appendJSONLBatch(s, productSnapshotsFile, rows)
}

func (s *Store) ProductSnapshots(filter domain.ProductSnapshotFilter) ([]domain.ProductSnapshot, error) {
	rows, err := s.productSnapshotRowsIndexed()
	if err != nil {
		return nil, err
	}
	out := make([]domain.ProductSnapshot, 0, len(rows))
	for _, v := range rows {
		if filter.ProductID != "" && v.ProductID != filter.ProductID {
			continue
		}
		if filter.CatalogID != "" && v.CatalogID != filter.CatalogID {
			continue
		}
		if filter.WindowDays > 0 && v.Window.Days != filter.WindowDays {
			continue
		}
		if filter.AsOf != "" && v.Window.CurrentEnd != filter.AsOf {
			continue
		}
		if filter.ModelVersion != "" && v.ModelVersion != filter.ModelVersion {
			continue
		}
		out = append(out, v)
	}
	return out, nil
}

func (s *Store) LatestProductSnapshot(filter domain.ProductSnapshotFilter) (domain.ProductSnapshot, bool, error) {
	xs, err := s.ProductSnapshots(filter)
	if err != nil {
		return domain.ProductSnapshot{}, false, err
	}
	if len(xs) == 0 {
		return domain.ProductSnapshot{}, false, nil
	}
	return xs[len(xs)-1], true, nil
}
