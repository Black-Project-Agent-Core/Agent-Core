package ranking

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"testing"
)

func normalizedFileSHA256(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw = bytes.ReplaceAll(raw, []byte("\r\n"), []byte("\n"))
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func TestC2GoldenC1FixtureFingerprintsAreLocked(t *testing.T) {
	cases := []struct {
		path string
		want string
	}{
		{"testdata/c1/product_v01_cases.json", "0a92b6231fc54ff4c4f1da764dd4c052dbbd9cddeca808eb432daa79c187c1f4"},
		{"testdata/c1/catalog_v01_cases.json", "95405a594432d9a87d383e8e3e9fba91af73508ef30c8b612dc5da03c8bafff3"},
		{"../indexing/testdata/c1/structural_index_v01_cases.json", "bb81d1b5df2e62e2566e5a3e2936e660e780cd5f67b4237dae7b8e1b2c8767ea"},
	}
	for _, tc := range cases {
		if got := normalizedFileSHA256(t, tc.path); got != tc.want {
			t.Errorf("fixture %s: normalized sha256 = %s, want %s", tc.path, got, tc.want)
		}
	}
}
