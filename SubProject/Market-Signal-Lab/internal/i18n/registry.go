package i18n

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
)

//go:embed locales/*.json
var localeFiles embed.FS

type Locale struct {
	Code     string `json:"code"`
	Label    string `json:"label"`
	HTMLLang string `json:"htmlLang"`
}

var supported = []Locale{
	{Code: "en", Label: "English", HTMLLang: "en"},
	{Code: "id", Label: "Indonesia", HTMLLang: "id"},
}

var (
	loadOnce sync.Once
	loaded   map[string]map[string]string
	loadErr  error
)

func Supported() []Locale {
	out := make([]Locale, len(supported))
	copy(out, supported)
	return out
}

func Default() string { return "en" }

func Normalize(code string) string {
	code = strings.ToLower(strings.TrimSpace(code))
	if i := strings.IndexByte(code, '-'); i >= 0 {
		code = code[:i]
	}
	for _, locale := range supported {
		if code == locale.Code {
			return locale.Code
		}
	}
	return Default()
}

func Dictionary(code string) (map[string]string, error) {
	code = strings.ToLower(strings.TrimSpace(code))
	valid := false
	for _, locale := range supported {
		if code == locale.Code {
			valid = true
			break
		}
	}
	if !valid {
		return nil, fmt.Errorf("unsupported locale %q", code)
	}
	loadOnce.Do(loadDictionaries)
	if loadErr != nil {
		return nil, loadErr
	}
	dict := loaded[code]
	out := make(map[string]string, len(dict))
	for key, value := range dict {
		out[key] = value
	}
	return out, nil
}

func Translate(lang, key string, vars map[string]string) string {
	lang = Normalize(lang)
	dict, err := Dictionary(lang)
	if err != nil {
		dict = nil
	}
	value, ok := dict[key]
	if !ok {
		en, enErr := Dictionary(Default())
		if enErr == nil {
			value, ok = en[key]
		}
	}
	if !ok {
		return key
	}
	for name, replacement := range vars {
		value = strings.ReplaceAll(value, "{"+name+"}", replacement)
	}
	return value
}

func loadLocaleFile(path string) (map[string]string, error) {
	data, err := localeFiles.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var dict map[string]string
	if err := json.Unmarshal(data, &dict); err != nil {
		return nil, fmt.Errorf("decode %s: %w", path, err)
	}
	return dict, nil
}

func loadDictionaries() {
	loaded = make(map[string]map[string]string, len(supported))
	for _, locale := range supported {
		basePath := "locales/" + locale.Code + ".json"
		dict, err := loadLocaleFile(basePath)
		if err != nil {
			loadErr = err
			return
		}
		securePath := "locales/" + locale.Code + ".secure.json"
		secure, err := loadLocaleFile(securePath)
		if err != nil {
			loadErr = err
			return
		}
		for key, value := range secure {
			dict[key] = value
		}
		loaded[locale.Code] = dict
	}
}
