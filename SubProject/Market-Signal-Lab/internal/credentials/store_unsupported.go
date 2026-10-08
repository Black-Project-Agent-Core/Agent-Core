//go:build !windows

package credentials

type systemStore struct{}

func NewSystemStore() SecretStore { return systemStore{} }

func (systemStore) Read(string) (string, bool, error) { return "", false, ErrUnsupportedPlatform }
func (systemStore) Write(string, string) error        { return ErrUnsupportedPlatform }
func (systemStore) Delete(string) error               { return ErrUnsupportedPlatform }
