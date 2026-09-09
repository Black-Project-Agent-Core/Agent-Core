package security

import "testing"

func TestSanitizeEnvatoProductURL(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
		ok   bool
	}{
		{name: "themeforest item", raw: "https://themeforest.net/item/avada-responsive-multipurpose-theme/2833226", want: "https://themeforest.net/item/avada-responsive-multipurpose-theme/2833226", ok: true},
		{name: "www normalized and tracking removed", raw: "https://www.graphicriver.net/item/editorial-presentation/12345?ref=author#preview", want: "https://graphicriver.net/item/editorial-presentation/12345", ok: true},
		{name: "codecanyon item", raw: " https://codecanyon.net/item/example/999 ", want: "https://codecanyon.net/item/example/999", ok: true},
		{name: "elements asset", raw: "https://elements.envato.com/editorial-presentation-ABCDE?utm_source=test#preview", want: "https://elements.envato.com/editorial-presentation-ABCDE", ok: true},
		{name: "http rejected", raw: "http://themeforest.net/item/example/1", ok: false},
		{name: "foreign host rejected", raw: "https://example.com/item/example/1", ok: false},
		{name: "subdomain lookalike rejected", raw: "https://themeforest.net.evil.example/item/example/1", ok: false},
		{name: "non item path rejected", raw: "https://themeforest.net/user/example", ok: false},
		{name: "userinfo rejected", raw: "https://token@themeforest.net/item/example/1", ok: false},
		{name: "empty rejected", raw: "", ok: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := SanitizeEnvatoProductURL(tt.raw)
			if ok != tt.ok || got != tt.want {
				t.Fatalf("SanitizeEnvatoProductURL(%q) = (%q,%v), want (%q,%v)", tt.raw, got, ok, tt.want, tt.ok)
			}
		})
	}
}
