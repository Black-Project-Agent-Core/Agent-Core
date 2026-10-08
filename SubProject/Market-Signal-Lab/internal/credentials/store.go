package credentials

import "errors"

const (
	DefaultTarget  = "MarketSignalLab/Envato"
	DefaultEnvName = "ENVATO_TOKEN"
)

var (
	ErrNotConfigured       = errors.New("credential not configured")
	ErrUnsupportedPlatform = errors.New("credential store unavailable on this platform")
)

type SecretStore interface {
	Read(target string) (secret string, found bool, err error)
	Write(target, secret string) error
	Delete(target string) error
}
