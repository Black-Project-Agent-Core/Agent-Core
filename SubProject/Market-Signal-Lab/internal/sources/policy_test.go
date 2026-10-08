package sources

import "testing"

func TestDefaultPolicyRegistryDefinesBoundedEnvatoAndFirstClassImports(t *testing.T) {
	r := DefaultPolicyRegistry()
	envato, err := r.Require("envato_market_api")
	if err != nil {
		t.Fatal(err)
	}
	if envato.RawPayloadRetention || envato.MaxRequestBudget != 60 || envato.MetadataTTLSeconds != 21600 {
		t.Fatalf("envato policy=%+v", envato)
	}
	if envato.CollectionMode != "user_initiated_bounded" {
		t.Fatalf("mode=%s", envato.CollectionMode)
	}
	imported, err := r.Require("envato_elements_manual")
	if err != nil {
		t.Fatal(err)
	}
	if imported.CollectionMode != "manual_import" || imported.MaxRequestBudget != 0 {
		t.Fatalf("import policy=%+v", imported)
	}
}

func TestPolicyRegistryRejectsUnknownSource(t *testing.T) {
	if _, err := DefaultPolicyRegistry().Require("private_magic_endpoint"); err == nil {
		t.Fatal("expected unknown source error")
	}
}
