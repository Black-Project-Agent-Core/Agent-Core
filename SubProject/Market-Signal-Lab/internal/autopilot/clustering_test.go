package autopilot

import (
	"testing"
)

func TestBuildProductDirectionsRecognizesKnownNoAIPatterns(t *testing.T) {
	in := ClusterInput{RunID: "run", Coverage: 80, AsOf: "2026-08-16T00:00:00Z", Products: []ClusterProduct{
		{ProductID: "p1", CatalogID: "sports", Title: "Padel Club Sponsorship Presentation", AuthorID: "a1", ObservedAt: "2026-08-15T00:00:00Z"},
		{ProductID: "p2", CatalogID: "mockups", Title: "Cosmetic Packaging Mockup", AuthorID: "a2", ObservedAt: "2026-08-14T00:00:00Z"},
		{ProductID: "p3", CatalogID: "fashion", Title: "Fashion Collection Editorial Dossier", AuthorID: "a3", ObservedAt: "2026-08-13T00:00:00Z"},
		{ProductID: "p4", CatalogID: "medical", Title: "Medical Partnership Pitch Deck", AuthorID: "a4", ObservedAt: "2026-08-12T00:00:00Z"},
	}}
	got := BuildProductDirections(in)
	labels := map[string]bool{}
	for _, c := range got.Clusters {
		labels[c.Label] = true
	}
	for _, want := range []string{"Sponsorship Presentation", "Packaging Mockup", "Fashion Collection Dossier", "Medical Partnership Presentation"} {
		if !labels[want] {
			t.Fatalf("missing %s clusters=%+v", want, got.Clusters)
		}
	}
	if len(got.Reviews) != 0 {
		t.Fatalf("reviews=%+v", got.Reviews)
	}
}

func TestBuildProductDirectionsQueuesAmbiguousAndClustersRepeatedNgram(t *testing.T) {
	got := BuildProductDirections(ClusterInput{RunID: "run", Coverage: 60, AsOf: "2026-08-16T00:00:00Z", Products: []ClusterProduct{
		{ProductID: "p1", Title: "Neon Urban Festival Toolkit", AuthorID: "a1"},
		{ProductID: "p2", Title: "Urban Festival Neon Toolkit", AuthorID: "a2"},
		{ProductID: "p3", Title: "Untitled Asset", AuthorID: "a3"},
	}})
	if len(got.Clusters) != 1 || got.Clusters[0].ProductCount != 2 {
		t.Fatalf("clusters=%+v", got.Clusters)
	}
	if len(got.Reviews) != 1 || got.Reviews[0].ProductID != "p3" {
		t.Fatalf("reviews=%+v", got.Reviews)
	}
}
