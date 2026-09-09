package security

import "testing"

func TestCaptureOnlyAllowsSupportedEnvatoCatalogPages(t *testing.T) {
	allowed := []string{"https://elements.envato.com/graphic-templates", "https://app.envato.com/graphic-templates", "https://graphicriver.net/graphics-with-graphic-templates"}
	for _, raw := range allowed {
		if !IsSupportedCapturePage(raw) {
			t.Fatalf("expected allowed %s", raw)
		}
	}
	for _, raw := range []string{"https://example.com/graphic-templates", "https://elements.envato.com.evil.test/graphic-templates", "file:///tmp/page.html", "javascript:alert(1)"} {
		if IsSupportedCapturePage(raw) {
			t.Fatalf("expected rejected %s", raw)
		}
	}
}
