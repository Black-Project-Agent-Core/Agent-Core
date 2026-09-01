mod classifier;
mod manager;
mod protector;
mod rotation;
mod secret;
mod store;
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
pub use types::{AvailabilityState, FailureClass, KeyId, KeySummary, LifecycleState, LimitReset};
