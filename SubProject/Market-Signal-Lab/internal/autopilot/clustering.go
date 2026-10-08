package autopilot

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strings"
	"time"
	"unicode"

	"marketsignallab/internal/domain"
)

const ProductDirectionModelVersion = "product-direction-rules-v0.1"

type ClusterProduct struct {
	ProductID  string
	CatalogID  string
	Title      string
	AuthorID   string
	ObservedAt string
}

type ClusterInput struct {
	RunID    string
	Coverage float64
	AsOf     string
	Products []ClusterProduct
}

type ClusterResult struct {
	Clusters []domain.ProductDirectionCluster
	Reviews  []domain.ClassificationReview
}

type directionRule struct {
	label       string
	productType string
	useCase     string
	required    [][]string
}

var directionRules = []directionRule{
	{label: "Sponsorship Presentation", productType: "presentation", useCase: "sponsorship", required: [][]string{{"sponsorship", "sponsor"}, {"presentation", "deck", "proposal"}}},
	{label: "Packaging Mockup", productType: "mockup", useCase: "packaging", required: [][]string{{"packaging", "package"}, {"mockup"}}},
	{label: "Fashion Collection Dossier", productType: "dossier", useCase: "fashion_collection", required: [][]string{{"fashion"}, {"collection"}, {"dossier", "editorial", "lookbook"}}},
	{label: "Medical Partnership Presentation", productType: "presentation", useCase: "medical_partnership", required: [][]string{{"medical", "healthcare", "clinic"}, {"partnership", "partner"}, {"presentation", "deck", "proposal", "pitch"}}},
}

var stopwords = map[string]bool{
	"the": true, "a": true, "an": true, "and": true, "or": true, "for": true, "of": true, "to": true, "in": true, "with": true,
	"template": true, "templates": true, "design": true, "professional": true, "modern": true, "creative": true, "premium": true,
	"untitled": true, "asset": true, "item": true,
}

func tokenizeTitle(title string) []string {
	var b strings.Builder
	for _, r := range strings.ToLower(title) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		} else {
			b.WriteByte(' ')
		}
	}
	seen := map[string]bool{}
	out := []string{}
	for _, tok := range strings.Fields(b.String()) {
		if len(tok) < 3 || stopwords[tok] || seen[tok] {
			continue
		}
		seen[tok] = true
		out = append(out, tok)
	}
	return out
}

func tokenSet(tokens []string) map[string]bool {
	m := map[string]bool{}
	for _, t := range tokens {
		m[t] = true
	}
	return m
}
func ruleMatches(set map[string]bool, rule directionRule) bool {
	for _, alternatives := range rule.required {
		ok := false
		for _, word := range alternatives {
			if set[word] {
				ok = true
				break
			}
		}
		if !ok {
			return false
		}
	}
	return true
}

func clusterID(runID, key string) string {
	sum := sha256.Sum256([]byte(runID + "|" + key))
	return "cluster-" + hex.EncodeToString(sum[:8])
}
func titleCaseTokens(tokens []string) string {
	out := make([]string, len(tokens))
	for i, t := range tokens {
		if t == "" {
			continue
		}
		out[i] = strings.ToUpper(t[:1]) + t[1:]
	}
	return strings.Join(out, " ")
}

func freshnessScore(asOf string, products []ClusterProduct) float64 {
	ref, err := time.Parse(time.RFC3339, asOf)
	if err != nil {
		ref = time.Now().UTC()
	}
	if len(products) == 0 {
		return 0
	}
	total := 0.0
	counted := 0
	for _, p := range products {
		t, e := time.Parse(time.RFC3339, p.ObservedAt)
		if e != nil {
			continue
		}
		days := ref.Sub(t).Hours() / 24
		score := 100 - days*2
		if score < 0 {
			score = 0
		}
		if score > 100 {
			score = 100
		}
		total += score
		counted++
	}
	if counted == 0 {
		return 50
	}
	return round1(total / float64(counted))
}
func round1(v float64) float64 { return float64(int(v*10+0.5)) / 10 }

func makeCluster(in ClusterInput, key, label, ptype, usecase string, products []ClusterProduct, fallback bool) domain.ProductDirectionCluster {
	ids := make([]string, 0, len(products))
	authors := map[string]bool{}
	catalogCounts := map[string]int{}
	for _, p := range products {
		ids = append(ids, p.ProductID)
		if p.AuthorID != "" {
			authors[p.AuthorID] = true
		}
		if p.CatalogID != "" {
			catalogCounts[p.CatalogID]++
		}
	}
	sort.Strings(ids)
	catalog := ""
	best := 0
	for id, n := range catalogCounts {
		if n > best || (n == best && id < catalog) {
			catalog, best = id, n
		}
	}
	confidence := 55.0 + float64(len(products))*8
	if fallback {
		confidence -= 10
	}
	if confidence > 90 {
		confidence = 90
	}
	confidence *= in.Coverage / 100
	if confidence > 90 {
		confidence = 90
	}
	opportunity := 45 + float64(len(products))*7
	if opportunity > 85 {
		opportunity = 85
	}
	return domain.ProductDirectionCluster{ID: clusterID(in.RunID, key), RunID: in.RunID, Key: key, Label: label, CatalogID: catalog, ProductType: ptype, UseCase: usecase, Keywords: strings.Fields(strings.ReplaceAll(key, "_", " ")), EvidenceProductIDs: ids, ProductCount: len(products), AuthorCount: len(authors), Freshness: freshnessScore(in.AsOf, products), Opportunity: round1(opportunity), Coverage: round1(in.Coverage), Confidence: round1(confidence), NeedsReview: false, ModelVersion: ProductDirectionModelVersion}
}

func BuildProductDirections(in ClusterInput) ClusterResult {
	known := map[string][]ClusterProduct{}
	knownRule := map[string]directionRule{}
	fallback := map[string][]ClusterProduct{}
	fallbackTokens := map[string][]string{}
	reviews := []domain.ClassificationReview{}
	for _, p := range in.Products {
		tokens := tokenizeTitle(p.Title)
		set := tokenSet(tokens)
		matched := false
		for _, rule := range directionRules {
			if ruleMatches(set, rule) {
				key := strings.ReplaceAll(strings.ToLower(rule.label), " ", "_")
				known[key] = append(known[key], p)
				knownRule[key] = rule
				matched = true
				break
			}
		}
		if matched {
			continue
		}
		if len(tokens) < 2 {
			reviews = append(reviews, domain.ClassificationReview{ID: clusterID(in.RunID, "review|"+p.ProductID), RunID: in.RunID, ProductID: p.ProductID, Title: p.Title, Reason: "insufficient_semantic_evidence", CreatedAt: in.AsOf, Status: "needs_review"})
			continue
		}
		sorted := append([]string(nil), tokens...)
		sort.Strings(sorted)
		key := strings.Join(sorted, "_")
		fallback[key] = append(fallback[key], p)
		fallbackTokens[key] = tokens
	}
	clusters := []domain.ProductDirectionCluster{}
	keys := make([]string, 0, len(known))
	for k := range known {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		r := knownRule[k]
		clusters = append(clusters, makeCluster(in, k, r.label, r.productType, r.useCase, known[k], false))
	}
	fkeys := make([]string, 0, len(fallback))
	for k := range fallback {
		fkeys = append(fkeys, k)
	}
	sort.Strings(fkeys)
	for _, k := range fkeys {
		ps := fallback[k]
		if len(ps) < 2 {
			p := ps[0]
			reviews = append(reviews, domain.ClassificationReview{ID: clusterID(in.RunID, "review|"+p.ProductID), RunID: in.RunID, ProductID: p.ProductID, Title: p.Title, Reason: "unconfirmed_singleton_pattern", CandidateLabels: []string{titleCaseTokens(fallbackTokens[k])}, CreatedAt: in.AsOf, Status: "needs_review"})
			continue
		}
		label := titleCaseTokens(fallbackTokens[k])
		clusters = append(clusters, makeCluster(in, "ngram_"+k, label, "observed_pattern", "", ps, true))
	}
	sort.Slice(clusters, func(i, j int) bool {
		if clusters[i].Opportunity == clusters[j].Opportunity {
			return clusters[i].Label < clusters[j].Label
		}
		return clusters[i].Opportunity > clusters[j].Opportunity
	})
	sort.Slice(reviews, func(i, j int) bool { return reviews[i].ProductID < reviews[j].ProductID })
	return ClusterResult{Clusters: clusters, Reviews: reviews}
}
