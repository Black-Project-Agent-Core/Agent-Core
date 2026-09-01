mod openrouter;
mod synthetic;
mod rotation;
mod classifier;
mod intelligence;
mod manager;
mod monitor;
mod protector;
mod secret;
mod store;
mod types;
mod usage;

pub use classifier::{classify_status, ClassifiedOutcome};
pub use intelligence::{
    derive_recent_success_score, score_credential, select_best_credential,
    CredentialScoreExplanation, CredentialScoreInput, CredentialSelectionDecision, ScoringError,
};
pub use openrouter::{OpenRouterProbeClient, OpenRouterValidationError};
pub use manager::{CredentialManager, ManagerError};
pub use monitor::{
    plan_shadow_health_probes, shadow_health_next_probe_at, ShadowHealthMonitor,
    ShadowHealthMonitorStartError, ShadowHealthProbePlan, MONITOR_HEALTHY_INTERVAL_MS,
    MONITOR_INITIAL_DELAY_MS, MONITOR_JITTER_WINDOW_MS, MONITOR_MAX_CONCURRENT_PROBES,
    MONITOR_WARNING_INTERVAL_MS,
};
pub use protector::{ProtectError, ProtectedBlob, SecretProtector};
pub use rotation::{KeyLease, OutcomeSignal, PoolUnavailable, RotationError, RotationSession, RotationSnapshot};
pub use synthetic::{run_synthetic_rotation_self_test, SyntheticRotationReport};
pub use secret::{SecretBytes, SecretValidationError};
pub use store::{NewStoredKey, StoreError, StoredKeyRecord, StoredKeyUpdate, VaultStore};
pub use types::{
    AvailabilityState, CredentialEvent, CredentialEventKind, CredentialProfile, CredentialProvider,
    FailureClass, KeyId, KeySummary, LifecycleState, LimitReset,
};
pub use usage::{
    analyze_usage, UsageAnalysis, UsageAnalysisError, UsageObservation, EWMA_ALPHA,
    MIN_PREDICTION_WARNING_CONFIDENCE, WARNING_EXHAUSTION_HORIZON_MS, WARNING_QUOTA_RATIO,
};
