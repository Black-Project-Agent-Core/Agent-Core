// Package semantics defines the C2 semantic projection contract: pure,
// identity-preserving renames of legacy C1 values into corrected semantic
// names. Projectors never recompute values.
package semantics

import "fmt"

const ContractVersionV2 = "msl-semantic-contract/2"

type Contract struct {
	Version string `json:"version"`
}

func contract(version string) (Contract, error) {
	if version != ContractVersionV2 {
		return Contract{}, fmt.Errorf("unsupported semantic contract %q", version)
	}
	return Contract{Version: ContractVersionV2}, nil
}
