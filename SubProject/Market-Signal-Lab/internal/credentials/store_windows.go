//go:build windows

package credentials

import (
	"errors"
	"fmt"
	"runtime"
	"strings"
	"syscall"
	"unsafe"
)

const (
	credTypeGeneric         = 1
	credPersistLocalMachine = 2
	maxCredentialBlobBytes  = 2560
	errorNotFound           = syscall.Errno(1168)
)

var (
	advapi32        = syscall.NewLazyDLL("Advapi32.dll")
	procCredReadW   = advapi32.NewProc("CredReadW")
	procCredWriteW  = advapi32.NewProc("CredWriteW")
	procCredDeleteW = advapi32.NewProc("CredDeleteW")
	procCredFree    = advapi32.NewProc("CredFree")
)

type nativeCredential struct {
	Flags              uint32
	Type               uint32
	TargetName         *uint16
	Comment            *uint16
	LastWritten        syscall.Filetime
	CredentialBlobSize uint32
	CredentialBlob     *byte
	Persist            uint32
	AttributeCount     uint32
	Attributes         uintptr
	TargetAlias        *uint16
	UserName           *uint16
}

type systemStore struct{}

func NewSystemStore() SecretStore { return systemStore{} }

func credentialTarget(target string) (*uint16, error) {
	if strings.TrimSpace(target) == "" {
		return nil, errors.New("credential target is required")
	}
	if strings.IndexByte(target, 0) >= 0 {
		return nil, errors.New("credential target contains NUL")
	}
	ptr, err := syscall.UTF16PtrFromString(target)
	if err != nil {
		return nil, fmt.Errorf("credential target %q: %w", target, err)
	}
	return ptr, nil
}

func winErr(operation, target string, err error) error {
	if err == nil || errors.Is(err, syscall.Errno(0)) {
		return fmt.Errorf("credential %s %q failed", operation, target)
	}
	return fmt.Errorf("credential %s %q: %w", operation, target, err)
}

func (systemStore) Read(target string) (string, bool, error) {
	targetPtr, err := credentialTarget(target)
	if err != nil {
		return "", false, err
	}
	var credentialPtr uintptr
	result, _, callErr := procCredReadW.Call(
		uintptr(unsafe.Pointer(targetPtr)),
		uintptr(credTypeGeneric),
		0,
		uintptr(unsafe.Pointer(&credentialPtr)),
	)
	if result == 0 {
		if errors.Is(callErr, errorNotFound) {
			return "", false, nil
		}
		return "", false, winErr("read", target, callErr)
	}
	if credentialPtr == 0 {
		return "", false, fmt.Errorf("credential read %q returned no credential", target)
	}
	defer procCredFree.Call(credentialPtr)

	credential := (*nativeCredential)(unsafe.Pointer(credentialPtr))
	if credential.CredentialBlobSize == 0 || credential.CredentialBlob == nil {
		return "", true, nil
	}
	blob := unsafe.Slice(credential.CredentialBlob, int(credential.CredentialBlobSize))
	secret := string(append([]byte(nil), blob...))
	return secret, true, nil
}

func (systemStore) Write(target, secret string) error {
	targetPtr, err := credentialTarget(target)
	if err != nil {
		return err
	}
	if strings.TrimSpace(secret) == "" {
		return errors.New("credential secret is required")
	}
	blob := []byte(secret)
	if len(blob) > maxCredentialBlobBytes {
		return fmt.Errorf("credential secret exceeds %d-byte limit", maxCredentialBlobBytes)
	}
	credential := nativeCredential{
		Type:               credTypeGeneric,
		TargetName:         targetPtr,
		CredentialBlobSize: uint32(len(blob)),
		CredentialBlob:     &blob[0],
		Persist:            credPersistLocalMachine,
	}
	result, _, callErr := procCredWriteW.Call(uintptr(unsafe.Pointer(&credential)), 0)
	runtime.KeepAlive(blob)
	if result == 0 {
		return winErr("write", target, callErr)
	}
	return nil
}

func (systemStore) Delete(target string) error {
	targetPtr, err := credentialTarget(target)
	if err != nil {
		return err
	}
	result, _, callErr := procCredDeleteW.Call(
		uintptr(unsafe.Pointer(targetPtr)),
		uintptr(credTypeGeneric),
		0,
	)
	if result == 0 {
		if errors.Is(callErr, errorNotFound) {
			return nil
		}
		return winErr("delete", target, callErr)
	}
	return nil
}
