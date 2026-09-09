package web

import (
	"reflect"
	"strings"
	"testing"
)

func assertNoTokenJSONField(t *testing.T, value any) {
	t.Helper()
	typeOf := reflect.TypeOf(value)
	for i := 0; i < typeOf.NumField(); i++ {
		field := typeOf.Field(i)
		jsonName := strings.Split(field.Tag.Get("json"), ",")[0]
		if strings.EqualFold(jsonName, "token") || strings.EqualFold(field.Name, "token") {
			t.Fatalf("%s exposes token field %s with json tag %q", typeOf.Name(), field.Name, field.Tag.Get("json"))
		}
	}
}

func TestOnlyCredentialSetupRequestOwnsTokenField(t *testing.T) {
	setupType := reflect.TypeOf(envatoCredentialRequest{})
	if field, ok := setupType.FieldByName("Token"); !ok || strings.Split(field.Tag.Get("json"), ",")[0] != "token" {
		t.Fatal("credential setup request must remain the explicit token input boundary")
	}
	assertNoTokenJSONField(t, autopilotRunRequest{})
	assertNoTokenJSONField(t, envatoSearchPayload{})
	assertNoTokenJSONField(t, envatoTotalItemsPayload{})
}
