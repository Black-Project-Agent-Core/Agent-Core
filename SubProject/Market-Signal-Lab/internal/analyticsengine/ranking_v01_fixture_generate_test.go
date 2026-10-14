package analyticsengine

import (
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

func TestC1GenerateRankingWireFixture(t *testing.T) {
	if os.Getenv("MSL_C1_UPDATE_RANKING_WIRE") != "1" {
		t.Skip("set MSL_C1_UPDATE_RANKING_WIRE=1 to regenerate the C1 ranking wire fixture")
	}

	previousMedian := 9.0
	rankVelocityScore := 75.0

	batch := AnalyticsBatch{Operations: []BatchOperation{
		{
			SlotID:      51,
			OperationID: V2OpProductRankingV01,
			SchemaID:    1,
			Input: ProductRankingV01Input{
				Products: []ProductRankingEntityV01{{
					ProductKey:           1,
					CatalogKey:           11,
					FirstSeenBucket:      RankingWindowCurrent,
					ApplicableQueryKeys:  []uint32{101, 102},
					SessionCoverages:     []float64{80, 100},
					SegmentationFallback: true,
				}},
				Observations: []ProductRankingObservationV01{{
					ProductKey:   1,
					WindowBucket: RankingWindowCurrent,
					QueryKey:     101,
					SurfaceCode:  1,
					Position:     7,
					Reliability:  0.9,
				}},
			},
		},
		{
			SlotID:      52,
			OperationID: V2OpCatalogRankingV01,
			SchemaID:    1,
			Input: CatalogRankingV01Input{
				Catalogs: []CatalogRankingEntityV01{{
					CatalogKey:               11,
					PeerGroupKey:             3,
					ApplicableQueryCount:     2,
					CurrentCompletedQueries:  2,
					PreviousCompletedQueries: 2,
					CurrentSessionCoverages:  []float64{90, 95},
				}},
				Observations: []CatalogRankingObservationV01{{
					CatalogKey:   11,
					ProductKey:   1,
					AuthorKey:    501,
					HasAuthor:    true,
					QueryKey:     101,
					WindowBucket: RankingWindowCurrent,
					Reliability:  0.9,
				}},
				Memberships: []CatalogProductMembershipV01{{CatalogKey: 11, ProductKey: 1}},
				FirstSeen:   []CatalogProductFirstSeenV01{{ProductKey: 1, FirstSeenBucket: RankingWindowCurrent}},
				ProductResults: []ProductRankingV01ResultRow{{
					ProductKey:               1,
					CurrentObservationCount:  1,
					PreviousObservationCount: 1,
					QueryAppearances:         1,
					ApplicableQueries:        2,
					SurfaceAppearances:       1,
					MedianPosition:           7,
					PreviousMedianPosition:   &previousMedian,
					RankVelocity:             2,
					RankVelocityScore:        &rankVelocityScore,
					ExposureScore:            81.2,
					FreshnessScore:           100,
					CrossQueryStrength:       50,
					RelativeStrength:         50,
					DirectionCode:            4,
					ComparableHistory:        true,
					Confidence:               80,
					Coverage:                 90,
					OpportunityScore:         68.7,
					MissingMask:              3,
				}},
			},
		},
		{
			SlotID:      53,
			OperationID: V2OpStructuralIndexV01,
			SchemaID:    1,
			Input: StructuralIndexV01Input{
				Segments: []StructuralSegmentEvidenceV01{{
					SegmentKey:       21,
					ParentKey:        2,
					LevelCode:        1,
					ObservedProducts: 40,
					DataQualityScore: 90,
					DataQualityGrade: 1,
				}},
			},
		},
	}}

	encoded, err := encodeAnalyticsBatchV2(902, batch, nil)
	if err != nil {
		t.Fatalf("encode C1 ranking wire fixture: %v", err)
	}

	dir := filepath.Join("..", "..", "testdata", "analytics_v2", "c1")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create C1 ranking wire fixture directory: %v", err)
	}
	path := filepath.Join(dir, "ranking_request_three_ops.hex")
	if err := os.WriteFile(path, []byte(hex.EncodeToString(encoded)+"\n"), 0o644); err != nil {
		t.Fatalf("write C1 ranking wire fixture: %v", err)
	}
	t.Logf("wrote %s (%d bytes)", path, len(encoded))
}
