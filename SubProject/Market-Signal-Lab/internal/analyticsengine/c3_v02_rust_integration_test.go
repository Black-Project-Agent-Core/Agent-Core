package analyticsengine

import (
	"context"
	"testing"
)

func TestC31RealRustWorkerExecutesAllDeterministicOperations(t *testing.T) {
	engine := realRustWorkerForParity(t)
	ctx := context.Background()

	accel, err := ExecuteCompetitionAccelerationV02(ctx, engine, CompetitionAccelerationV02Input{OlderCount: 80, PriorCount: 100, CurrentCount: 140})
	if err != nil {
		t.Fatal(err)
	}
	if accel.PreviousDeltaPercent != 25 || accel.CurrentDeltaPercent != 40 || accel.Acceleration != 15 || accel.ZeroBaselineFlags != 0 {
		t.Fatalf("acceleration=%+v", accel)
	}

	momentum, err := ExecuteDirectionalMomentumV02(ctx, engine, DirectionalMomentumV02Input{Rising: 7, Neutral: 2, Falling: 1})
	if err != nil {
		t.Fatal(err)
	}
	if momentum.ODMI != 60 || momentum.MomentumMagnitude != 60 || momentum.ComparableProducts != 10 {
		t.Fatalf("momentum=%+v", momentum)
	}

	prr, err := ExecutePeerRelativeRankV02(ctx, engine, PeerRelativeRankV02Input{SubjectIndex: 1, Values: []float64{-20, 10, 10, 80}})
	if err != nil {
		t.Fatal(err)
	}
	if prr.Percentile != 50 || prr.PeerGroupSize != 4 {
		t.Fatalf("prr=%+v", prr)
	}

	author, err := ExecuteAuthorConcentrationChangeV02(ctx, engine, AuthorConcentrationChangeV02Input{Prior: 31.25, Current: 27.5})
	if err != nil {
		t.Fatal(err)
	}
	if author.Change != -3.8 {
		t.Fatalf("author=%+v", author)
	}

	movement, err := ExecuteMovementDivergenceV02(ctx, engine, MovementDivergenceV02Input{
		TotalChildCount: 4,
		Children:        []MovementChildV02{{Value: 50, ProductMass: 10}, {Value: -10, ProductMass: 30}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if movement.ProductMassWeighted != 5 || movement.EqualSegment != 20 || movement.SignedDivergence != -15 || movement.DivergenceMagnitude != 15 || movement.SegmentMovementParticipation != 50 || movement.EligibleChildCount != 2 || movement.TotalChildCount != 4 {
		t.Fatalf("movement=%+v", movement)
	}
}
