mod openrouter;
mod synthetic;
mod rotation;
mod classifier;
mod manager;
mod protector;
mod secret;
mod store;
mod types;

pub use classifier::{classify_status, ClassifiedOutcome};
pub use openrouter::{OpenRouterProbeClient, OpenRouterValidationError};
pub use manager::{CredentialManager, ManagerError};
pub use protector::{ProtectError, ProtectedBlob, SecretProtector};
pub use rotation::{KeyLease, OutcomeSignal, PoolUnavailable, RotationError, RotationSession, RotationSnapshot};
pub use synthetic::{run_synthetic_rotation_self_test, SyntheticRotationReport};
pub use secret::{SecretBytes, SecretValidationError};
pub use store::{NewStoredKey, StoreError, StoredKeyRecord, StoredKeyUpdate, VaultStore};
pub use types::{AvailabilityState, FailureClass, KeyId, KeySummary, LifecycleState, LimitReset};
