package analyticsengine

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"strings"
)

type ParityCorpus struct {
	Observations int                         `json:"observations"`
	Distribution DistributionSimilarityInput `json:"distribution"`
	Item         ItemVolatilityInput         `json:"item"`
	Cluster      ClusterVolatilityInput      `json:"cluster"`
	Selection    SelectionProbabilityInput   `json:"selection"`
}

type ParityCheck struct {
	Operation string  `json:"operation"`
	OK        bool    `json:"ok"`
	Delta     float64 `json:"delta"`
	Message   string  `json:"message,omitempty"`
}

type ParityCorpusReport struct {
	Observations     int           `json:"observations"`
	Fingerprint      string        `json:"fingerprint"`
	InputBytes       int           `json:"inputBytes"`
	Reference        string        `json:"reference"`
	Candidate        string        `json:"candidate"`
	CandidateHealth  Health        `json:"candidateHealth"`
	Checks           []ParityCheck `json:"checks"`
	MaxDelta         float64       `json:"maxDelta"`
	MismatchCount    int           `json:"mismatchCount"`
	WorkerErrorCount int           `json:"workerErrorCount"`
	Verified         bool          `json:"verified"`
}

func BuildDeterministicCorpus(observations int) ParityCorpus {
	if observations < 1 {
		observations = 1
	}
	a := make(map[string]float64, 64)
	b := make(map[string]float64, 64)
	selection := make([]SelectionObservation, observations)
	for i := 0; i < observations; i++ {
		aKey := "bucket-" + twoDigits(i%64)
		bKey := "bucket-" + twoDigits((i*7+3)%64)
		a[aKey] += float64(1 + i%7)
		b[bKey] += float64(1 + i%11)
		selection[i] = SelectionObservation{Weight: float64(1 + i%5), Selected: i%7 < 3}
	}

	rankCount := observations
	if rankCount > 4096 {
		rankCount = 4096
	}
	ranks := make([]*int, rankCount)
	present := 0
	for i := 0; i < rankCount; i++ {
		if i%17 == 0 {
			continue
		}
		value := 1 + (i*13)%100
		ranks[i] = corpusIntPtr(value)
		present++
	}

	shareCount := observations
	if shareCount > 1024 {
		shareCount = 1024
	}
	shares := make([]float64, shareCount)
	for i := range shares {
		shares[i] = 5 + float64((i*19)%37) + float64(i%10)/10
	}

	return ParityCorpus{
		Observations: observations,
		Distribution: DistributionSimilarityInput{A: a, B: b},
		Item:         ItemVolatilityInput{Ranks: ranks, TopK: 100, ConsecutiveAppearances: present, EligibleSnapshots: rankCount, RBOToPrevious: 73.25},
		Cluster:      ClusterVolatilityInput{Shares: shares, ContextDisagreement: 31.5, CrossTimePersistence: 68.75},
		Selection:    SelectionProbabilityInput{Observations: selection},
	}
}

func twoDigits(v int) string {
	const digits = "0123456789abcdef"
	return string([]byte{digits[(v>>4)&0xf], digits[v&0xf]})
}

func corpusIntPtr(v int) *int { return &v }

func CorpusFingerprint(c ParityCorpus) string {
	b, _ := json.Marshal(c)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func RunParityCorpus(ctx context.Context, reference, candidate Engine, corpus ParityCorpus) ParityCorpusReport {
	payload, _ := json.Marshal(corpus)
	report := ParityCorpusReport{Observations: corpus.Observations, Fingerprint: CorpusFingerprint(corpus), InputBytes: len(payload)}
	if reference != nil {
		report.Reference = reference.Name()
	}
	if candidate != nil {
		report.Candidate = candidate.Name()
		report.CandidateHealth = candidate.Health(ctx)
	} else {
		report.CandidateHealth = Health{Status: EngineUnavailable, Protocol: ProtocolV1, Message: "candidate engine is unavailable"}
	}
	if reference == nil || candidate == nil || report.CandidateHealth.Status != EngineHealthy {
		return report
	}

	checks := make([]ParityCheck, 0, 4)
	allOK := true

	refDist, refErr := reference.DistributionSimilarity(ctx, corpus.Distribution)
	candDist, candErr := candidate.DistributionSimilarity(ctx, corpus.Distribution)
	checks = append(checks, parityCheck(OpDistributionSimilarity, refErr, candErr, func() (float64, bool) {
		delta := math.Abs(refDist.Score - candDist.Score)
		return delta, delta <= paritySimilarityTolerance
	}))

	refItem, refErr := reference.ItemVolatility(ctx, corpus.Item)
	candItem, candErr := candidate.ItemVolatility(ctx, corpus.Item)
	checks = append(checks, parityCheck(OpItemVolatility, refErr, candErr, func() (float64, bool) {
		return parityVolatilityDelta(refItem, candItem)
	}))

	refCluster, refErr := reference.ClusterVolatility(ctx, corpus.Cluster)
	candCluster, candErr := candidate.ClusterVolatility(ctx, corpus.Cluster)
	checks = append(checks, parityCheck(OpClusterVolatility, refErr, candErr, func() (float64, bool) {
		return parityVolatilityDelta(refCluster, candCluster)
	}))

	refSelection, refErr := reference.SelectionProbability(ctx, corpus.Selection)
	candSelection, candErr := candidate.SelectionProbability(ctx, corpus.Selection)
	checks = append(checks, parityCheck(OpSelectionProbability, refErr, candErr, func() (float64, bool) {
		return paritySelectionDelta(refSelection, candSelection)
	}))

	for _, check := range checks {
		if check.Delta > report.MaxDelta {
			report.MaxDelta = check.Delta
		}
		if !check.OK {
			allOK = false
			report.MismatchCount++
		}
		if strings.HasPrefix(check.Message, "candidate error:") {
			report.WorkerErrorCount++
		}
	}
	report.Checks = checks
	report.Verified = allOK && len(checks) == 4
	return report
}

func parityCheck(operation string, refErr, candidateErr error, compare func() (float64, bool)) ParityCheck {
	if refErr != nil {
		return ParityCheck{Operation: operation, Message: "reference error: " + refErr.Error()}
	}
	if candidateErr != nil {
		return ParityCheck{Operation: operation, Message: "candidate error: " + candidateErr.Error()}
	}
	delta, ok := compare()
	return ParityCheck{Operation: operation, OK: ok, Delta: delta}
}

func BenchmarkGateOpen(report ParityCorpusReport) bool {
	if !report.Verified || report.CandidateHealth.Status != EngineHealthy || len(report.Checks) != 4 {
		return false
	}
	for _, check := range report.Checks {
		if !check.OK {
			return false
		}
	}
	return true
}

const (
	paritySimilarityTolerance = 1e-6
	parityVolatilityTolerance = 1e-6
	paritySelectionTolerance  = 1e-9
)

func parityMaxDelta(values ...float64) float64 {
	max := 0.0
	for _, value := range values {
		if value > max {
			max = value
		}
	}
	return max
}

func parityVolatilityDelta(a, b VolatilityResult) (float64, bool) {
	delta := parityMaxDelta(
		math.Abs(a.Score-b.Score),
		math.Abs(a.RankVariance-b.RankVariance),
		math.Abs(a.AbsenceRate-b.AbsenceRate),
		math.Abs(a.MedianAbsoluteDeviation-b.MedianAbsoluteDeviation),
		math.Abs(a.RBOPersistence-b.RBOPersistence),
		math.Abs(a.ConsecutivePersistence-b.ConsecutivePersistence),
	)
	return delta, delta <= parityVolatilityTolerance && a.Label == b.Label
}

func paritySelectionDelta(a, b SelectionProbabilityResult) (float64, bool) {
	delta := parityMaxDelta(math.Abs(a.Score-b.Score), math.Abs(a.SelectedWeight-b.SelectedWeight), math.Abs(a.EligibleWeight-b.EligibleWeight))
	return delta, delta <= paritySelectionTolerance && a.SelectedCount == b.SelectedCount && a.EligibleCount == b.EligibleCount
}
