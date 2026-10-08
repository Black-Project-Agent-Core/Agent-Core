package ingest

import (
	"encoding/csv"
	"fmt"
	"io"
	"marketsignallab/internal/domain"
	"strconv"
	"strings"
	"time"
)

var requiredObservedProductHeaders = []string{
	"session_id",
	"query_id",
	"catalog_id",
	"source_type",
	"external_item_id",
	"title",
	"observed_at",
}

// ParseObservedProductsCSV converts a bounded, user-provided market observation
// export into normalized universe inputs. It deliberately accepts only the
// normalized public metadata and observation facts needed by the local model.
func ParseObservedProductsCSV(r io.Reader) ([]domain.ObservedProductInput, error) {
	cr := csv.NewReader(r)
	cr.TrimLeadingSpace = true
	header, err := cr.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}
	idx := make(map[string]int, len(header))
	for i, raw := range header {
		name := strings.TrimSpace(raw)
		if name == "" {
			return nil, fmt.Errorf("header %d is empty", i+1)
		}
		if _, exists := idx[name]; exists {
			return nil, fmt.Errorf("duplicate header %q", name)
		}
		idx[name] = i
	}
	for _, name := range requiredObservedProductHeaders {
		if _, ok := idx[name]; !ok {
			return nil, fmt.Errorf("missing required header %q", name)
		}
	}

	out := []domain.ObservedProductInput{}
	rowNumber := 1
	for {
		rowNumber++
		row, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("row %d: %w", rowNumber, err)
		}
		get := func(name string) string {
			i, ok := idx[name]
			if !ok || i >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[i])
		}

		position, err := optionalNonNegativeInt(get("position"), 0)
		if err != nil {
			return nil, fmt.Errorf("row %d: invalid position: %w", rowNumber, err)
		}
		page, err := optionalNonNegativeInt(get("page"), 1)
		if err != nil || page < 1 {
			return nil, fmt.Errorf("row %d: invalid page", rowNumber)
		}
		reliability := 0.5
		if raw := get("observation_reliability"); raw != "" {
			reliability, err = strconv.ParseFloat(raw, 64)
			if err != nil || reliability < 0 || reliability > 1 {
				return nil, fmt.Errorf("row %d: observation_reliability must be between 0 and 1", rowNumber)
			}
		}
		observedAt := get("observed_at")
		if _, err := time.Parse(time.RFC3339, observedAt); err != nil {
			return nil, fmt.Errorf("row %d: observed_at must be RFC3339", rowNumber)
		}
		surface := get("surface_type")
		if surface == "" {
			surface = "imported_snapshot"
		}

		item := domain.ObservedProductInput{
			SessionID:              get("session_id"),
			QueryID:                get("query_id"),
			CatalogID:              get("catalog_id"),
			SourceType:             get("source_type"),
			ExternalItemID:         get("external_item_id"),
			Title:                  get("title"),
			ExternalAuthorKey:      get("author_external_key"),
			AuthorDisplayName:      get("author_display_name"),
			SourceURL:              get("source_url"),
			PreviewRef:             get("preview_ref"),
			CategoryText:           get("category_text"),
			SurfaceType:            domain.MarketSurface(surface),
			Position:               position,
			Page:                   page,
			ObservedAt:             observedAt,
			ObservationReliability: reliability,
		}
		if item.SessionID == "" || item.QueryID == "" || item.CatalogID == "" || item.SourceType == "" || item.ExternalItemID == "" || item.Title == "" {
			return nil, fmt.Errorf("row %d: session_id, query_id, catalog_id, source_type, external_item_id, and title are required", rowNumber)
		}
		out = append(out, item)
	}
	return out, nil
}

func optionalNonNegativeInt(raw string, fallback int) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 0 {
		return 0, fmt.Errorf("must be a non-negative integer")
	}
	return value, nil
}
