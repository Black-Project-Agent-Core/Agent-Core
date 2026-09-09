package analytics

import (
	"marketsignallab/internal/domain"
	"math"
)

func benchmarkComposite(b domain.Benchmark) *float64 {
	vals := []float64{}
	if b.Demand != nil {
		vals = append(vals, clamp(*b.Demand))
	}
	if b.Growth != nil {
		vals = append(vals, clamp(*b.Growth))
	}
	if b.SearchToDownload != nil {
		vals = append(vals, clamp(*b.SearchToDownload))
	}
	if b.Supply != nil {
		vals = append(vals, 100-clamp(*b.Supply))
	}
	if len(vals) == 0 {
		return nil
	}
	sum := 0.0
	for _, v := range vals {
		sum += v
	}
	x := math.Round((sum/float64(len(vals)))*10) / 10
	return &x
}

func Compare(a domain.Analysis, b domain.Benchmark) domain.Comparison {
	c := benchmarkComposite(b)
	agreement := 0.0
	divergence := 100.0
	if c != nil {
		divergence = math.Abs(a.Opportunity - *c)
		if divergence > 100 {
			divergence = 100
		}
		agreement = 100 - divergence
	}
	da := "unavailable"
	if a.Direction != "" && b.Direction != "" {
		if a.Direction == b.Direction {
			da = "same"
		} else if a.Direction == "neutral" || b.Direction == "neutral" {
			da = "mixed"
		} else {
			da = "opposite"
		}
	}
	return domain.Comparison{ID: domain.NewID(), IdentityID: a.IdentityID, AsOf: a.AsOf, AnalysisID: a.ID, BenchmarkID: b.ID, Agreement: math.Round(agreement*10) / 10, Divergence: math.Round(divergence*10) / 10, DirectionAgreement: da, BenchmarkComposite: c}
}
