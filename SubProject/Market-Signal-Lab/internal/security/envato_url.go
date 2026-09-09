package security

import (
	"net/url"
	"strings"
)

var envatoMarketProductHosts = map[string]bool{
	"themeforest.net":     true,
	"codecanyon.net":      true,
	"graphicriver.net":    true,
	"videohive.net":       true,
	"audiojungle.net":     true,
	"photodune.net":       true,
	"3docean.net":         true,
	"elements.envato.com": true,
}

// SanitizeEnvatoProductURL validates a stored public Envato Market item URL
// and removes query/fragment data before it is exposed to the browser UI.
func SanitizeEnvatoProductURL(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return "", false
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	host = strings.TrimPrefix(host, "www.")
	if !envatoMarketProductHosts[host] {
		return "", false
	}
	lowerPath := strings.ToLower(u.Path)
	if host == "elements.envato.com" {
		if u.Path == "" || u.Path == "/" {
			return "", false
		}
	} else if !strings.Contains(lowerPath, "/item/") {
		return "", false
	}
	u.Host = host
	u.RawQuery = ""
	u.ForceQuery = false
	u.Fragment = ""
	return u.String(), true
}

// SanitizeEnvatoPageURL validates public Envato browsing/catalog pages used as observation contexts.
func SanitizeEnvatoPageURL(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return "", false
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	host = strings.TrimPrefix(host, "www.")
	if !envatoMarketProductHosts[host] {
		return "", false
	}
	if u.Path == "" {
		u.Path = "/"
	}
	if !strings.HasPrefix(u.Path, "/") {
		return "", false
	}
	u.Host = host
	u.RawQuery = ""
	u.ForceQuery = false
	u.Fragment = ""
	return u.String(), true
}

// SplitEnvatoPageURL returns normalized host and path from an already sanitized Envato page URL.
func SplitEnvatoPageURL(raw string) (string, string) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", ""
	}
	return strings.ToLower(strings.TrimPrefix(u.Hostname(), "www.")), u.Path
}

// NormalizeEnvatoProductURL is retained as a compatibility alias.
func NormalizeEnvatoProductURL(raw string) (string, bool) {
	return SanitizeEnvatoProductURL(raw)
}
