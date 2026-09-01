mod classifier;
mod manager;
mod protector;
mod rotation;
mod secret;
mod store;
mod synthetic;
mod types;

pub use classifier::{classify_status, ClassifiedOutcome};
pub use manager::{CredentialManager, ManagerError};
pub use protector::{ProtectError, ProtectedBlob, SecretProtector};
pub use rotation::{
    KeyLease, OutcomeReport, OutcomeSignal, PoolUnavailable, PoolUnavailableReason, RotationError,
    RotationKeySnapshot, RotationSession, RotationSnapshot,
};
pub use secret::{SecretBytes, SecretValidationError};
pub use store::{NewStoredKey, StoreError, StoredKeyRecord, StoredKeyUpdate, VaultStore};
pub use synthetic::{run_synthetic_rotation_self_test, SyntheticError, SyntheticRotationReport};
pub use types::{AvailabilityState, FailureClass, KeyId, KeySummary, LifecycleState, LimitReset};
