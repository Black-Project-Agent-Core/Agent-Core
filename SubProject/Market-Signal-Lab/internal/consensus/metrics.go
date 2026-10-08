package consensus

import (
	"context"
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"math"
	"sort"
	"strings"
)

func clampScore(v float64) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func uniqueSet(xs []string) map[string]bool {
	m := map[string]bool{}
	for _, x := range xs {
		x = strings.TrimSpace(x)
		if x != "" {
			m[x] = true
		}
	}
	return m
}

func OverlapCoefficient(a, b []string) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	left := uniqueSet(a)
	right := uniqueSet(b)
	if len(left) == 0 || len(right) == 0 {
		return 0
	}
	shared := 0
	for x := range right {
		if left[x] {
			shared++
		}
	}
	denom := len(left)
	if len(right) < denom {
		denom = len(right)
	}
	return clampScore(100 * float64(shared) / float64(denom))
}

// RankBiasedOverlap uses finite-list extrapolated RBO. It is deterministic and bounded [0,100].
func RankBiasedOverlap(a, b []string, p float64) float64 {
	if p <= 0 || p >= 1 || len(a) == 0 || len(b) == 0 {
		return 0
	}
	depth := len(a)
	if len(b) > depth {
		depth = len(b)
	}
	seenA := map[string]bool{}
	seenB := map[string]bool{}
	overlap := 0
	weighted := 0.0
	lastAgreement := 0.0
	for d := 1; d <= depth; d++ {
		if d <= len(a) {
			x := a[d-1]
			if !seenA[x] {
				seenA[x] = true
				if seenB[x] {
					overlap++
				}
			}
		}
		if d <= len(b) {
			x := b[d-1]
			if !seenB[x] {
				seenB[x] = true
				if seenA[x] {
					overlap++
				}
			}
		}
		lastAgreement = float64(overlap) / float64(d)
		weighted += (1 - p) * math.Pow(p, float64(d-1)) * lastAgreement
	}
	extrapolated := weighted + math.Pow(p, float64(depth))*lastAgreement
	return clampScore(100 * extrapolated)
}

func SharedRankAgreement(a, b []string) (float64, int) {
	posA := map[string]int{}
	posB := map[string]int{}
	for i, x := range a {
		if _, ok := posA[x]; !ok {
			posA[x] = i
		}
	}
	for i, x := range b {
		if _, ok := posB[x]; !ok {
			posB[x] = i
		}
	}
	shared := []string{}
	for x := range posA {
		if _, ok := posB[x]; ok {
			shared = append(shared, x)
		}
	}
	n := len(shared)
	if n == 0 {
		return 0, 0
	}
	if n == 1 {
		return 100, 1
	}
	sort.Slice(shared, func(i, j int) bool { return posA[shared[i]] < posA[shared[j]] })
	rankA := map[string]int{}
	for i, x := range shared {
		rankA[x] = i
	}
	sharedB := append([]string(nil), shared...)
	sort.Slice(sharedB, func(i, j int) bool { return posB[sharedB[i]] < posB[sharedB[j]] })
	rankB := map[string]int{}
	for i, x := range sharedB {
		rankB[x] = i
	}
	dist := 0
	for _, x := range shared {
		d := rankA[x] - rankB[x]
		if d < 0 {
			d = -d
		}
		dist += d
	}
	maxDist := 0
	for i := 0; i < n; i++ {
		d := i - (n - 1 - i)
		if d < 0 {
			d = -d
		}
		maxDist += d
	}
	if maxDist == 0 {
		return 100, n
	}
	return clampScore(100 * (1 - float64(dist)/float64(maxDist))), n
}

func JensenShannonSimilarityWithEngine(ctx context.Context, engine analyticsengine.Engine, a, b map[string]float64) (float64, error) {
	if engine == nil {
		return 0, ErrAnalyticsEngineRequired
	}
	result, err := engine.DistributionSimilarity(ctx, analyticsengine.DistributionSimilarityInput{A: a, B: b})
	if err != nil {
		return 0, err
	}
	return result.Score, nil
}

func AuthorBreadthSimilarity(a, b []domain.SurfaceSnapshotItem) (float64, bool) {
	aa := []string{}
	bb := []string{}
	for _, x := range a {
		if strings.TrimSpace(x.AuthorPublicName) != "" {
			aa = append(aa, strings.ToLower(strings.TrimSpace(x.AuthorPublicName)))
		}
	}
	for _, x := range b {
		if strings.TrimSpace(x.AuthorPublicName) != "" {
			bb = append(bb, strings.ToLower(strings.TrimSpace(x.AuthorPublicName)))
		}
	}
	if len(aa) == 0 || len(bb) == 0 {
		return 0, false
	}
	return OverlapCoefficient(aa, bb), true
}
