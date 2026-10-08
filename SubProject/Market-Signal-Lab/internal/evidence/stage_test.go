package evidence

import (
	"reflect"
	"testing"

	"marketsignallab/internal/domain"
)

func TestMaximumStageValidCurrentCompositionIsCompositionOnly(t *testing.T) {
	got, reasons := MaximumStage(StageInput{ClaimType: domain.ClaimTypeComposition})
	if got != domain.EvidenceStageCompositionOnly {
		t.Fatalf("stage=%s", got)
	}
	if len(reasons) != 0 {
		t.Fatalf("reasons=%v", reasons)
	}
}

func TestMaximumStageMovementWithOnlyCurrentWindowIsCompositionOnly(t *testing.T) {
	got, reasons := MaximumStage(StageInput{
		ClaimType:                domain.ClaimTypeMovement,
		ComparableWindowCount:    1,
		ScopeComparable:          true,
		WindowDurationComparable: true,
	})
	if got != domain.EvidenceStageCompositionOnly {
		t.Fatalf("stage=%s", got)
	}
	wantReasons := []domain.ReasonCode{domain.ReasonLimitedTemporalDepth}
	if !reflect.DeepEqual(reasons, wantReasons) {
		t.Fatalf("reasons=%v want=%v", reasons, wantReasons)
	}
}

func TestMaximumStageMovementWithComparableHistoryStopsAtMovementIndication(t *testing.T) {
	for _, comparableWindows := range []int{2, 6, 20} {
		t.Run(string(rune('0'+comparableWindows%10)), func(t *testing.T) {
			got, reasons := MaximumStage(StageInput{
				ClaimType:                domain.ClaimTypeMovement,
				ComparableWindowCount:    comparableWindows,
				ScopeComparable:          true,
				WindowDurationComparable: true,
			})
			if got != domain.EvidenceStageMovementIndication {
				t.Fatalf("windows=%d stage=%s", comparableWindows, got)
			}
			if len(reasons) != 0 {
				t.Fatalf("windows=%d reasons=%v", comparableWindows, reasons)
			}
		})
	}
}

func TestMaximumStageMovementRequiresComparableScopeAndWindowDuration(t *testing.T) {
	cases := []StageInput{
		{ClaimType: domain.ClaimTypeMovement, ComparableWindowCount: 2, ScopeComparable: false, WindowDurationComparable: true},
		{ClaimType: domain.ClaimTypeMovement, ComparableWindowCount: 2, ScopeComparable: true, WindowDurationComparable: false},
	}
	for i, in := range cases {
		got, reasons := MaximumStage(in)
		if got != domain.EvidenceStageCompositionOnly {
			t.Fatalf("case=%d stage=%s", i, got)
		}
		wantReasons := []domain.ReasonCode{domain.ReasonLimitedTemporalDepth}
		if !reflect.DeepEqual(reasons, wantReasons) {
			t.Fatalf("case=%d reasons=%v want=%v", i, reasons, wantReasons)
		}
	}
}

func TestMaximumStageIgnoresLegacyDirectionStageAuthorization(t *testing.T) {
	legacyStages := []domain.DirectionStage{
		domain.DirectionStagePreliminary,
		domain.DirectionStageEstablished,
	}
	for _, legacyStage := range legacyStages {
		_ = legacyStage // legacy state exists, but it is intentionally not part of StageInput.
		got, reasons := MaximumStage(StageInput{
			ClaimType:                domain.ClaimTypeMovement,
			ComparableWindowCount:    1,
			ScopeComparable:          true,
			WindowDurationComparable: true,
		})
		if got != domain.EvidenceStageCompositionOnly {
			t.Fatalf("legacy=%s stage=%s", legacyStage, got)
		}
		if !reflect.DeepEqual(reasons, []domain.ReasonCode{domain.ReasonLimitedTemporalDepth}) {
			t.Fatalf("legacy=%s reasons=%v", legacyStage, reasons)
		}
	}
}

func TestMaximumStagePeerRelativeCapsInheritedC3Stage(t *testing.T) {
	cases := []struct {
		name      string
		inherited domain.EvidenceStage
		want      domain.EvidenceStage
	}{
		{name: "composition", inherited: domain.EvidenceStageCompositionOnly, want: domain.EvidenceStageCompositionOnly},
		{name: "movement", inherited: domain.EvidenceStageMovementIndication, want: domain.EvidenceStageMovementIndication},
		{name: "preliminary", inherited: domain.EvidenceStagePreliminaryTrend, want: domain.EvidenceStageMovementIndication},
		{name: "established", inherited: domain.EvidenceStageEstablishedTrend, want: domain.EvidenceStageMovementIndication},
		{name: "seasonality", inherited: domain.EvidenceStageSeasonalityCandidate, want: domain.EvidenceStageMovementIndication},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			inherited := tc.inherited
			got, reasons := MaximumStage(StageInput{ClaimType: domain.ClaimTypePeerRelative, InheritedStage: &inherited})
			if got != tc.want {
				t.Fatalf("inherited=%s stage=%s want=%s", tc.inherited, got, tc.want)
			}
			if len(reasons) != 0 {
				t.Fatalf("reasons=%v", reasons)
			}
		})
	}
}

func TestMaximumStagePeerRelativeWithoutInheritedStageIsCompositionOnly(t *testing.T) {
	got, reasons := MaximumStage(StageInput{ClaimType: domain.ClaimTypePeerRelative})
	if got != domain.EvidenceStageCompositionOnly {
		t.Fatalf("stage=%s", got)
	}
	if len(reasons) != 0 {
		t.Fatalf("reasons=%v", reasons)
	}
}
