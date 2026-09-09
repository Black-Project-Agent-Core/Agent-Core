package security

import (
	"errors"
	"marketsignallab/internal/domain"
	"math"
	"net/url"
	"strings"
)

var captureHosts = map[string]bool{
	"elements.envato.com": true,
	"app.envato.com":      true,
	"graphicriver.net":    true,
	"themeforest.net":     true,
	"codecanyon.net":      true,
	"videohive.net":       true,
	"audiojungle.net":     true,
	"photodune.net":       true,
	"3docean.net":         true,
}

func IsSupportedCapturePage(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return false
	}
	host := strings.ToLower(strings.TrimPrefix(strings.TrimSuffix(u.Hostname(), "."), "www."))
	if !captureHosts[host] || u.Path == "" || u.Path == "/" {
		return false
	}
	return true
}

func CanonicalEnvatoItemURL(raw string) (string, error) {
	if v, ok := SanitizeEnvatoProductURL(raw); ok {
		return v, nil
	}
	return "", errors.New("unsupported Envato item URL")
}

func ValidateCapturePayload(p domain.SurfaceCapturePayload) error {
	if strings.TrimSpace(p.RawHTML) != "" {
		return errors.New("raw HTML is forbidden")
	}
	if !IsSupportedCapturePage(p.PageURL) {
		return errors.New("unsupported capture page")
	}
	if p.TopKRequested < 1 || p.TopKRequested > 200 {
		return errors.New("topKRequested must be 1..200")
	}
	if len(p.Items) > 200 {
		return errors.New("capture may contain at most 200 items")
	}
	switch strings.ToLower(strings.TrimSpace(p.CaptureStatus)) {
	case "complete", "partial":
	default:
		return errors.New("unsupported capture status")
	}
	seenRank := map[int]bool{}
	seenKey := map[string]bool{}
	for _, item := range p.Items {
		if item.Rank < 1 || item.Rank > p.TopKRequested {
			return errors.New("item rank outside top-k")
		}
		if seenRank[item.Rank] {
			return errors.New("duplicate item rank")
		}
		seenRank[item.Rank] = true
		key := ""
		if strings.TrimSpace(item.ExternalItemID) != "" {
			key = "id:" + strings.TrimSpace(item.ExternalItemID)
		} else if u, err := CanonicalEnvatoItemURL(item.SourceURL); err == nil {
			key = "url:" + u
		} else {
			return errors.New("item requires externalItemId or valid Envato item URL")
		}
		if seenKey[key] {
			return errors.New("duplicate item identity")
		}
		seenKey[key] = true
		if item.SourceURL != "" {
			if _, err := CanonicalEnvatoItemURL(item.SourceURL); err != nil {
				return err
			}
		}
		if math.IsNaN(item.TaxonomyConfidence) || math.IsInf(item.TaxonomyConfidence, 0) {
			return errors.New("non-finite taxonomy confidence")
		}
	}
	return nil
}
