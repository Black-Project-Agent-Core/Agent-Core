package credentials

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"strings"
)

type Source string

const (
	SourceEnvironment       Source = "environment"
	SourceCredentialManager Source = "credential_manager"
)

type Resolved struct {
	Token       string
	Source      Source
	Fingerprint string
}

type Resolver struct {
	store   SecretStore
	getenv  func(string) string
	envName string
	target  string
}

func NewResolver(store SecretStore, getenv func(string) string, envName, target string) *Resolver {
	if getenv == nil {
		getenv = os.Getenv
	}
	if strings.TrimSpace(envName) == "" {
		envName = DefaultEnvName
	}
	if strings.TrimSpace(target) == "" {
		target = DefaultTarget
	}
	return &Resolver{store: store, getenv: getenv, envName: envName, target: target}
}

func (r *Resolver) Resolve() (Resolved, error) {
	if token := strings.TrimSpace(r.getenv(r.envName)); token != "" {
		return Resolved{Token: token, Source: SourceEnvironment, Fingerprint: Fingerprint(token)}, nil
	}
	if r.store == nil {
		return Resolved{}, ErrNotConfigured
	}
	secret, found, err := r.store.Read(r.target)
	if err != nil {
		return Resolved{}, err
	}
	secret = strings.TrimSpace(secret)
	if !found || secret == "" {
		return Resolved{}, ErrNotConfigured
	}
	return Resolved{Token: secret, Source: SourceCredentialManager, Fingerprint: Fingerprint(secret)}, nil
}

func Fingerprint(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	raw := strings.ToUpper(hex.EncodeToString(sum[:4]))
	return raw[:4] + "-" + raw[4:8]
}
