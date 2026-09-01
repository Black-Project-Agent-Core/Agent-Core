use agent_code_credential_core::{
    AvailabilityState, CredentialEventKind, KeyId, LifecycleState, NewStoredKey, ProtectedBlob,
    StoreError, VaultStore,
};

fn sample_key() -> NewStoredKey {
    NewStoredKey {
        key_id: KeyId("key-1".to_owned()),
        slot_index: 0,
        label: "Primary".to_owned(),
        masked_suffix: "••••1234".to_owned(),
        protected_blob: ProtectedBlob::new(vec![9, 8, 7, 6, 5]),
        lifecycle_state: LifecycleState::Enabled,
        availability_state: AvailabilityState::Ready,
        cooldown_until_utc_ms: None,
        consecutive_failures: 0,
        last_success_at_utc_ms: None,
        last_failure_at_utc_ms: None,
        last_failure_class: None,
        last_probe_at_utc_ms: None,
        limit_value: None,
        limit_remaining: None,
        limit_reset: None,
        usage_daily: None,
        is_free_tier: None,
        expires_at_utc_ms: None,
        created_at_utc_ms: 100,
        updated_at_utc_ms: 100,
    }
}

#[test]
fn credential_events_are_append_only_bounded_and_survive_restart() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vault.db");
    let key_id = KeyId("key-1".to_owned());

    {
        let mut store = VaultStore::open(&path).unwrap();
        store.insert_key(sample_key()).unwrap();
        let added = store
            .append_event(CredentialEventKind::CredentialAdded, &key_id, 100)
            .unwrap();
        let healthy = store
            .append_event(CredentialEventKind::CredentialHealthy, &key_id, 200)
            .unwrap();
        assert!(healthy.event_id > added.event_id);
        assert_eq!(store.list_events(1).unwrap(), vec![healthy.clone()]);

        let serialized = serde_json::to_string(&healthy).unwrap();
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("protected_blob"));
        assert!(!serialized.contains("ciphertext"));
    }

    let store = VaultStore::open(&path).unwrap();
    let events = store.list_events(10).unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].kind, CredentialEventKind::CredentialHealthy);
    assert_eq!(events[1].kind, CredentialEventKind::CredentialAdded);
    assert!(matches!(store.list_events(0), Err(StoreError::InvalidStoredValue("event_limit"))));
    assert!(matches!(store.list_events(501), Err(StoreError::InvalidStoredValue("event_limit"))));
}
