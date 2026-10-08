package app

import (
	"fmt"
	"marketsignallab/internal/domain"
	"strings"
	"testing"
)

func seededUniverseService(t *testing.T) (*Service, string, string) {
	t.Helper()
	svc, _ := newUniverseServiceForTest(t, nil)
	path, err := svc.EnsureCatalogPath(domain.CatalogPathInput{Platform: "Envato Elements", ContentType: "Presentation", Catalog: "Sports"})
	if err != nil {
		t.Fatal(err)
	}
	cat := path[len(path)-1]
	q1, err := svc.CreateResearchQuery(domain.ResearchQuery{Name: "sports-a", Platform: "Envato Elements", SourceType: "envato_elements_manual", QueryText: "sports", CatalogScopeID: cat.ID, Purpose: "catalog_observation", Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	q2, err := svc.CreateResearchQuery(domain.ResearchQuery{Name: "sports-b", Platform: "Envato Elements", SourceType: "envato_elements_manual", QueryText: "sports proposal", CatalogScopeID: cat.ID, Purpose: "catalog_observation", Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	session, err := svc.StartResearchSession(StartResearchSessionRequest{SourceType: "envato_elements_manual", Scope: cat.ID, QueryIDs: []string{q1.ID, q2.ID}, RequestBudget: 0})
	if err != nil {
		t.Fatal(err)
	}
	csv := fmt.Sprintf("session_id,query_id,catalog_id,source_type,external_item_id,title,author_external_key,author_display_name,source_url,preview_ref,category_text,surface_type,position,page,observed_at,observation_reliability\n%s,%s,%s,envato_elements_manual,p1,Padel Sponsorship Deck,alice,Alice Studio,https://example.test/p1,thumb1,Sports,search,1,1,2026-08-15T04:00:00Z,0.8\n%s,%s,%s,envato_elements_manual,p2,Sports Club Proposal,bob,Bob Studio,https://example.test/p2,thumb2,Sports,search,2,1,2026-08-15T04:01:00Z,0.8\n", session.ID, q1.ID, cat.ID, session.ID, q2.ID, cat.ID)
	if _, err := svc.ImportObservedProductsCSV(strings.NewReader(csv)); err != nil {
		t.Fatal(err)
	}
	return svc, cat.ID, session.ID
}

func findCatalogRow(rows []CatalogUniverseRow, name string) CatalogUniverseRow {
	for _, row := range rows {
		if row.Catalog.Name == name {
			return row
		}
	}
	return CatalogUniverseRow{}
}

func TestCatalogUniverseReportsObservedCountsAndLatestScopeCoverage(t *testing.T) {
	svc, _, _ := seededUniverseService(t)
	rows, err := svc.CatalogUniverse("")
	if err != nil {
		t.Fatal(err)
	}
	sports := findCatalogRow(rows, "Sports")
	if sports.Catalog.ID == "" || sports.ObservedProducts != 2 || sports.ObservedAuthors != 2 || sports.Coverage != 100 {
		t.Fatalf("sports=%+v", sports)
	}
}

func TestProductUniverseShowsMetadataFreshnessWithoutChangingHistoricalFacts(t *testing.T) {
	svc, catalogID, _ := seededUniverseService(t)
	rows, err := svc.ProductUniverse(catalogID)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].ObservationCount == 0 || rows[0].MetadataFreshness != "IMPORTED SNAPSHOT" {
		t.Fatalf("products=%+v", rows)
	}
}

func TestAuthorUniverseAndSessionAuditUseDistinctIdentities(t *testing.T) {
	svc, catalogID, sessionID := seededUniverseService(t)
	authors, err := svc.AuthorUniverse(catalogID)
	if err != nil {
		t.Fatal(err)
	}
	if len(authors) != 2 || authors[0].ObservedProducts != 1 {
		t.Fatalf("authors=%+v", authors)
	}
	audit, err := svc.ResearchSessionAudit(sessionID)
	if err != nil {
		t.Fatal(err)
	}
	if audit.ObservedProducts != 2 || audit.ObservedAuthors != 2 || audit.ObservationRows != 2 || audit.Session.CoverageEstimate != 100 {
		t.Fatalf("audit=%+v", audit)
	}
}
