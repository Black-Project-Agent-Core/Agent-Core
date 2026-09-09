package ingest

import (
	"strings"
	"testing"
)

func TestParseObservedProductsCSVPreservesPublicMarketMetadata(t *testing.T) {
	csv := `session_id,query_id,catalog_id,source_type,external_item_id,title,author_external_key,author_display_name,source_url,preview_ref,category_text,surface_type,position,page,observed_at,observation_reliability
s1,q1,c1,envato_elements_manual,abc123,Fashion Collection Dossier,alice,Alice Studio,https://example.test/item,thumb-1,Fashion,search,4,1,2026-08-15T04:00:00Z,0.8
`
	xs, err := ParseObservedProductsCSV(strings.NewReader(csv))
	if err != nil {
		t.Fatal(err)
	}
	if len(xs) != 1 || xs[0].ExternalItemID != "abc123" || xs[0].AuthorDisplayName != "Alice Studio" || xs[0].Position != 4 {
		t.Fatalf("rows=%+v", xs)
	}
}

func TestParseObservedProductsCSVRejectsMissingStableItemIdentity(t *testing.T) {
	csv := `session_id,query_id,catalog_id,source_type,external_item_id,title,observed_at
s1,q1,c1,envato_elements_manual,,Missing ID,2026-08-15T04:00:00Z
`
	if _, err := ParseObservedProductsCSV(strings.NewReader(csv)); err == nil {
		t.Fatal("expected external item id error")
	}
}

func TestParseObservedProductsCSVRejectsDuplicateHeadersAndInvalidReliability(t *testing.T) {
	duplicate := `session_id,query_id,catalog_id,source_type,external_item_id,title,title,observed_at
s1,q1,c1,manual,p1,A,A,2026-08-15T04:00:00Z
`
	if _, err := ParseObservedProductsCSV(strings.NewReader(duplicate)); err == nil {
		t.Fatal("expected duplicate header error")
	}
	invalid := `session_id,query_id,catalog_id,source_type,external_item_id,title,observed_at,observation_reliability
s1,q1,c1,manual,p1,A,2026-08-15T04:00:00Z,1.2
`
	if _, err := ParseObservedProductsCSV(strings.NewReader(invalid)); err == nil {
		t.Fatal("expected reliability range error")
	}
}
