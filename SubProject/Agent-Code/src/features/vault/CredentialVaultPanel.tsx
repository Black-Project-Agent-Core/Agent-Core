import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, LockKeyhole, Trash2, X } from 'lucide-react';
import { addKey, deleteKey, listEvents, listKeys, setKeyEnabled, validateKey } from './vault-api';
import type { CredentialEvent, KeySummary } from './vault-types';

export type CredentialVaultPanelProps = {
  onClose(): void;
};

type VaultLoadState = 'loading' | 'ready' | 'native-unavailable';

export function CredentialVaultPanel({ onClose }: CredentialVaultPanelProps) {
  const secretInputRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [keys, setKeys] = useState<KeySummary[]>([]);
  const [events, setEvents] = useState<CredentialEvent[]>([]);
  const [loadState, setLoadState] = useState<VaultLoadState>('loading');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const loaded = await listKeys();
      setKeys([...loaded].sort((left, right) => left.slot_index - right.slot_index));
      setLoadState('ready');
      return true;
    } catch {
      setKeys([]);
      setEvents([]);
      setLoadState('native-unavailable');
      return false;
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      setEvents(await listEvents(20));
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadKeys(), loadActivity()]);
  }, [loadActivity, loadKeys]);

  async function handleImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = secretInputRef.current;
    if (!input || busy) {
      return;
    }
    const secret = input.value;
    if (!secret.trim()) {
      return;
    }
    const importPromise = addKey(secret, label.trim());
    input.value = '';
    setBusy(true);
    setNotice(null);
    try {
      await importPromise;
      setLabel('');
      setNotice('Key imported securely.');
      await Promise.all([loadKeys(), loadActivity()]);
    } catch {
      setNotice('Key import failed.');
    } finally {
      setBusy(false);
    }
  }


  async function handleValidate(key: KeySummary) {
    setBusy(true);
    setNotice(null);
    try {
      const updated = await validateKey(key.key_id);
      setKeys((current) => current.map((item) => (item.key_id === updated.key_id ? updated : item)));
      setNotice('Key validation completed.');
      await loadActivity();
    } catch {
      setNotice('Key validation could not be completed.');
      await loadKeys();
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(key: KeySummary) {
    setBusy(true);
    setNotice(null);
    try {
      const updated = await setKeyEnabled(key.key_id, key.lifecycle_state !== 'ENABLED');
      setKeys((current) => current.map((item) => (item.key_id === updated.key_id ? updated : item)));
    } catch {
      setNotice('Key state update failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(key: KeySummary) {
    setBusy(true);
    setNotice(null);
    try {
      await deleteKey(key.key_id);
      setKeys((current) => current.filter((item) => item.key_id !== key.key_id));
      await loadActivity();
    } catch {
      setNotice('Key deletion failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="vault-surface" aria-label="Credential vault">
      <header className="vault-header">
        <div>
          <div className="vault-eyebrow"><LockKeyhole size={13} /> Secure local storage</div>
          <h1>Credential Vault</h1>
          <p>OpenRouter keys stay protected by the Windows-native vault. Stored secrets are never shown again.</p>
        </div>
        <button type="button" className="icon-button vault-close" onClick={onClose} aria-label="Close credential vault">
          <X size={17} />
        </button>
      </header>

      <form className="vault-import" onSubmit={handleImport}>
        <div className="vault-field vault-secret-field">
          <label htmlFor="vault-secret">OpenRouter API key</label>
          <input
            id="vault-secret"
            ref={secretInputRef}
            type="password"
            autoComplete="off"
            spellCheck={false}
            aria-label="OpenRouter API key"
            placeholder="Paste once to protect locally"
            disabled={busy || loadState === 'native-unavailable'}
          />
        </div>
        <div className="vault-field vault-label-field">
          <label htmlFor="vault-label">Key label</label>
          <input
            id="vault-label"
            type="text"
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
            aria-label="Key label"
            placeholder="Optional"
            maxLength={80}
            disabled={busy || loadState === 'native-unavailable'}
          />
        </div>
        <button type="submit" className="vault-import-button" disabled={busy || loadState === 'native-unavailable'}>
          <KeyRound size={15} />
          Import key
        </button>
      </form>

      {notice ? <p className="vault-notice" role="status">{notice}</p> : null}
      {loadState === 'loading' ? <p className="vault-empty">Loading protected key metadata…</p> : null}
      {loadState === 'native-unavailable' ? (
        <div className="vault-native-unavailable" role="status">
          <strong>Native vault unavailable in browser preview.</strong>
          <span>Open the Windows desktop build to manage protected credentials.</span>
        </div>
      ) : null}
      {loadState === 'ready' && keys.length === 0 ? (
        <div className="vault-empty">No OpenRouter keys stored yet.</div>
      ) : null}

      {loadState === 'ready' && keys.length > 0 ? (
        <div className="vault-list" aria-label="Stored OpenRouter keys">
          {keys.map((key) => (
            <article className="vault-key-row" key={key.key_id}>
              <div className="vault-key-identity">
                <div className="vault-key-title-line">
                  <strong>{key.label}</strong>
                  <code>{key.masked_suffix}</code>
                </div>
                <div className="vault-badges" aria-label={`${key.label} state`}>
                  <span className={`vault-badge vault-badge-${key.lifecycle_state.toLowerCase()}`}>{key.lifecycle_state}</span>
                  <span className={`vault-badge vault-badge-${key.availability_state.toLowerCase()}`}>{key.availability_state}</span>
                </div>
              </div>
              <div className="vault-key-actions">
                <button
                  type="button"
                  className="vault-secondary-button"
                  onClick={() => void handleValidate(key)}
                  disabled={busy}
                  aria-label={`Validate ${key.label}`}
                >
                  Validate
                </button>
                <button type="button" className="vault-secondary-button" onClick={() => void handleToggle(key)} disabled={busy}>
                  {key.lifecycle_state === 'ENABLED' ? 'Disable' : 'Enable'}
                </button>
                <button type="button" className="vault-icon-danger" onClick={() => void handleDelete(key)} disabled={busy} aria-label={`Delete ${key.label}`}>
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {loadState === 'ready' ? (
        <section className="vault-activity" aria-label="Credential activity log">
          <div className="vault-activity-header">
            <h2>Credential activity</h2>
            <span>Latest {events.length} metadata-only events</span>
          </div>
          {events.length === 0 ? <p className="vault-activity-empty">No credential activity recorded yet.</p> : null}
          {events.length > 0 ? (
            <div className="vault-activity-list">
              {events.map((event) => {
                const key = keys.find((item) => item.key_id === event.key_id);
                return (
                  <div className="vault-activity-row" key={event.event_id}>
                    <div>
                      <strong>{event.kind}</strong>
                      <span>{key?.label ?? `Credential ${event.key_id.slice(0, 8)}`}</span>
                    </div>
                    <time dateTime={new Date(event.occurred_at_utc_ms).toISOString()}>
                      {new Date(event.occurred_at_utc_ms).toLocaleString()}
                    </time>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
