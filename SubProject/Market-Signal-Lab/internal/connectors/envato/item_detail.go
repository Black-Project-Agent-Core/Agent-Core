package envato

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"time"
)

type ItemDetailResult struct {
	ExternalItemID   string `json:"externalItemId"`
	Title            string `json:"title,omitempty"`
	SourceURL        string `json:"sourceUrl,omitempty"`
	ReleasedAt       string `json:"releasedAt,omitempty"`
	ReleasePrecision string `json:"releasePrecision,omitempty"`
	ReleaseField     string `json:"releaseField,omitempty"`
	HTTPRequests     int    `json:"httpRequests"`
	ObservedAt       string `json:"observedAt"`
}

var explicitReleaseFields = []string{
	"published_at",
	"publishedAt",
	"published_date",
	"publishedDate",
	"released_at",
	"releasedAt",
	"release_date",
	"releaseDate",
}

func normalizeExplicitRelease(value string) (string, string, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", "", false
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.UTC().Format(time.RFC3339), "datetime", true
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return parsed.Format("2006-01-02"), "date", true
	}
	return "", "", false
}

func explicitReleaseFromValues(values map[string]string) (string, string, string) {
	for _, field := range explicitReleaseFields {
		if value, precision, ok := normalizeExplicitRelease(values[field]); ok {
			return value, precision, field
		}
	}
	return "", "", ""
}

func explicitReleaseFromMap(m map[string]any) (string, string, string) {
	values := make(map[string]string, len(explicitReleaseFields))
	for _, field := range explicitReleaseFields {
		values[field] = valueString(m[field])
	}
	return explicitReleaseFromValues(values)
}

func itemDetailMap(decoded any) (map[string]any, bool) {
	m, ok := decoded.(map[string]any)
	if !ok {
		return nil, false
	}
	if nested, ok := m["item"].(map[string]any); ok {
		return nested, true
	}
	return m, true
}

func (c *Client) ItemDetail(ctx context.Context, token, itemID string, allowance int) (ItemDetailResult, error) {
	itemID = strings.TrimSpace(itemID)
	if itemID == "" {
		return ItemDetailResult{}, errors.New("item id is required")
	}
	body, used, err := c.doGET(ctx, token, "/v3/market/catalog/item", url.Values{"id": {itemID}}, allowance)
	result := ItemDetailResult{ExternalItemID: itemID, HTTPRequests: used, ObservedAt: time.Now().UTC().Format(time.RFC3339)}
	if err != nil {
		return result, err
	}
	var decoded any
	dec := json.NewDecoder(strings.NewReader(string(body)))
	dec.UseNumber()
	if err := dec.Decode(&decoded); err != nil {
		return result, errors.New("invalid Envato item detail response")
	}
	m, ok := itemDetailMap(decoded)
	if !ok {
		return result, errors.New("invalid Envato item detail response")
	}
	for _, key := range []string{"id", "item_id", "itemId"} {
		if id := valueString(m[key]); id != "" {
			result.ExternalItemID = id
			break
		}
	}
	for _, key := range []string{"name", "title", "item"} {
		if title := valueString(m[key]); title != "" {
			result.Title = title
			break
		}
	}
	result.SourceURL = valueString(m["url"])
	result.ReleasedAt, result.ReleasePrecision, result.ReleaseField = explicitReleaseFromMap(m)
	return result, nil
}
