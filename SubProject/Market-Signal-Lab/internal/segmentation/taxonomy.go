package segmentation

import (
	"marketsignallab/internal/domain"
	"regexp"
	"strings"
	"unicode"
)

const TaxonomyVersion = "taxonomy-segmentation-v0.1"

type Input struct {
	Site           string
	SourceCategory string
	TargetCategory string
	Title          string
	Surface        domain.MarketSurface
}

type Result struct {
	ContentType string
	Catalog     string
	Subcatalog  string
	ProductType string
	UseCase     string
	Topic       string
	Style       string
	Confidence  float64
	Status      domain.IntegrityStatus
	ReasonCodes []string
}

var splitCategory = regexp.MustCompile(`[/>|]+`)

func titleCaseWords(value string) string {
	words := strings.Fields(strings.TrimSpace(strings.ReplaceAll(value, "-", " ")))
	for i, word := range words {
		runes := []rune(strings.ToLower(word))
		if len(runes) > 0 {
			runes[0] = unicode.ToUpper(runes[0])
		}
		words[i] = string(runes)
	}
	return strings.Join(words, " ")
}

func SiteContentType(site string) string {
	switch strings.ToLower(strings.TrimSpace(site)) {
	case "graphicriver.net":
		return "Graphics"
	case "themeforest.net":
		return "Web Templates"
	case "codecanyon.net":
		return "Code"
	case "videohive.net":
		return "Video"
	case "audiojungle.net":
		return "Audio"
	case "photodune.net":
		return "Photos"
	case "3docean.net":
		return "3D"
	default:
		return "Market"
	}
}

func Classify(in Input) Result {
	result := Result{
		ContentType: SiteContentType(in.Site),
		Status:      domain.IntegrityStatusNeedsReview,
		ReasonCodes: []string{"taxonomy_insufficient"},
	}
	category := strings.TrimSpace(in.SourceCategory)
	if category == "" {
		category = strings.TrimSpace(in.TargetCategory)
	}
	parts := []string{}
	for _, part := range splitCategory.Split(category, -1) {
		if value := titleCaseWords(part); value != "" {
			parts = append(parts, value)
		}
	}
	if len(parts) > 0 && !IsReservedSurfaceCatalogName(parts[0]) {
		result.Catalog = parts[0]
	}
	if len(parts) > 1 && !IsReservedSurfaceCatalogName(parts[1]) {
		result.Subcatalog = parts[1]
	}

	text := strings.ToLower(strings.Join([]string{category, in.Title}, " "))
	switch {
	case strings.Contains(text, "presentation") || strings.Contains(text, "pitch deck"):
		result.ProductType = "presentation"
	case strings.Contains(text, "mockup"):
		result.ProductType = "mockup"
	case strings.Contains(text, "font") || strings.Contains(text, "typeface"):
		result.ProductType = "font"
	case strings.Contains(text, "after effects") || strings.Contains(text, "video template"):
		result.ProductType = "video template"
	case strings.Contains(text, "wordpress") || strings.Contains(text, "website theme"):
		result.ProductType = "website theme"
	case strings.Contains(text, "plugin") || strings.Contains(text, "script"):
		result.ProductType = "code plugin"
	case strings.Contains(text, "photo"):
		result.ProductType = "photo"
	case strings.Contains(text, "3d") || strings.Contains(text, "model"):
		result.ProductType = "3d asset"
	}
	switch {
	case strings.Contains(text, "sponsor"):
		result.UseCase = "sponsorship proposal"
	case strings.Contains(text, "investor") || strings.Contains(text, "pitch"):
		result.UseCase = "investor pitch"
	case strings.Contains(text, "product launch"):
		result.UseCase = "product launch"
	case strings.Contains(text, "wedding planner"):
		result.UseCase = "wedding planner proposal"
	case strings.Contains(text, "packaging") && strings.Contains(text, "mockup"):
		result.UseCase = "packaging mockup"
	case strings.Contains(text, "collection") && strings.Contains(text, "fashion"):
		result.UseCase = "fashion collection dossier"
	}

	evidence := 0
	if result.Catalog != "" {
		evidence += 35
	}
	if result.ProductType != "" {
		evidence += 35
	}
	if result.UseCase != "" {
		evidence += 20
	}
	if result.Subcatalog != "" {
		evidence += 10
	}
	result.Confidence = float64(evidence)
	if evidence >= 60 {
		result.Status = domain.IntegrityStatusNativeAlpha65
		result.ReasonCodes = []string{"taxonomy_rule_match"}
	}
	return result
}
