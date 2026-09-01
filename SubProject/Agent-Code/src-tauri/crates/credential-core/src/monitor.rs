use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use thiserror::Error;

use crate::{
    AvailabilityState, CredentialManager, KeyId, KeySummary, LifecycleState, OpenRouterProbeClient,
    SecretProtector,
};

pub const MONITOR_MAX_CONCURRENT_PROBES: usize = 2;
pub const MONITOR_HEALTHY_INTERVAL_MS: i64 = 15 * 60 * 1_000;
pub const MONITOR_WARNING_INTERVAL_MS: i64 = 5 * 60 * 1_000;
pub const MONITOR_INITIAL_DELAY_MS: i64 = 30 * 1_000;
pub const MONITOR_JITTER_WINDOW_MS: i64 = 60 * 1_000;
const PRIMARY_POOL_SIZE: i64 = 20;
const JITTER_BUCKET_MS: i64 = MONITOR_JITTER_WINDOW_MS / PRIMARY_POOL_SIZE;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShadowHealthProbePlan {
    pub key_id: KeyId,
    pub slot_index: i64,
    pub due_at_utc_ms: i64,
}

pub fn shadow_health_next_probe_at(
    summary: &KeySummary,
    monitor_started_at_utc_ms: i64,
) -> Option<i64> {
    if summary.lifecycle_state != LifecycleState::Enabled {
        return None;
    }

    let jitter_ms = deterministic_jitter_ms(summary);
    let due_base = match summary.availability_state {
        AvailabilityState::Unverified => {
            if let Some(last_probe) = summary.last_probe_at_utc_ms {
                last_probe.checked_add(MONITOR_HEALTHY_INTERVAL_MS)?
            } else {
                monitor_started_at_utc_ms.checked_add(MONITOR_INITIAL_DELAY_MS)?
            }
        }
        AvailabilityState::Ready | AvailabilityState::Exhausted => {
            if let Some(last_probe) = summary.last_probe_at_utc_ms {
                last_probe.checked_add(MONITOR_HEALTHY_INTERVAL_MS)?
            } else {
                monitor_started_at_utc_ms.checked_add(MONITOR_INITIAL_DELAY_MS)?
            }
        }
        AvailabilityState::Warning => {
            if let Some(last_probe) = summary.last_probe_at_utc_ms {
                last_probe.checked_add(MONITOR_WARNING_INTERVAL_MS)?
            } else {
                monitor_started_at_utc_ms.checked_add(MONITOR_INITIAL_DELAY_MS)?
            }
        }
        AvailabilityState::Cooldown => summary.cooldown_until_utc_ms?,
    };

    due_base.checked_add(jitter_ms)
}

pub fn plan_shadow_health_probes(
    summaries: &[KeySummary],
    monitor_started_at_utc_ms: i64,
    now_utc_ms: i64,
) -> Vec<ShadowHealthProbePlan> {
    let mut due = summaries
        .iter()
        .filter_map(|summary| {
            let due_at_utc_ms = shadow_health_next_probe_at(summary, monitor_started_at_utc_ms)?;
            (due_at_utc_ms <= now_utc_ms).then(|| ShadowHealthProbePlan {
                key_id: summary.key_id.clone(),
                slot_index: summary.slot_index,
                due_at_utc_ms,
            })
        })
        .collect::<Vec<_>>();

    due.sort_by(|left, right| {
        left.due_at_utc_ms
            .cmp(&right.due_at_utc_ms)
            .then_with(|| left.slot_index.cmp(&right.slot_index))
            .then_with(|| left.key_id.0.cmp(&right.key_id.0))
    });
    due.truncate(MONITOR_MAX_CONCURRENT_PROBES);
    due
}

fn deterministic_jitter_ms(summary: &KeySummary) -> i64 {
    let slot_bucket = summary.slot_index.rem_euclid(PRIMARY_POOL_SIZE);
    let bucket_start = slot_bucket * JITTER_BUCKET_MS;
    let within_bucket =
        (stable_hash64(summary.key_id.0.as_bytes()) % JITTER_BUCKET_MS as u64) as i64;
    bucket_start + within_bucket
}

fn stable_hash64(bytes: &[u8]) -> u64 {
    const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
    bytes.iter().fold(FNV_OFFSET, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(FNV_PRIME)
    })
}

const MONITOR_POLL_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Debug, Error)]
pub enum ShadowHealthMonitorStartError {
    #[error("OpenRouter shadow-health probe client could not be initialized")]
    ProbeClientUnavailable,
    #[error("shadow-health monitor thread could not be started")]
    ThreadUnavailable,
}

trait MonitorProbeRunner: Send + Sync + 'static {
    fn list_summaries(&self) -> Result<Vec<KeySummary>, ()>;
    fn probe(&self, key_id: &KeyId, now_utc_ms: i64) -> Result<(), ()>;
}

struct ManagerProbeRunner<P: SecretProtector> {
    manager: Arc<CredentialManager<P>>,
    client: OpenRouterProbeClient,
}

impl<P: SecretProtector> MonitorProbeRunner for ManagerProbeRunner<P> {
    fn list_summaries(&self) -> Result<Vec<KeySummary>, ()> {
        self.manager.list_summaries().map_err(|_| ())
    }

    fn probe(&self, key_id: &KeyId, now_utc_ms: i64) -> Result<(), ()> {
        self.manager
            .validate_openrouter_key_for_shadow_monitor_with(key_id, &self.client, now_utc_ms)
            .map(|_| ())
            .map_err(|_| ())
    }
}

pub struct ShadowHealthMonitor {
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl ShadowHealthMonitor {
    pub fn start<P: SecretProtector>(
        manager: Arc<CredentialManager<P>>,
    ) -> Result<Self, ShadowHealthMonitorStartError> {
        let client = OpenRouterProbeClient::new()
            .map_err(|_| ShadowHealthMonitorStartError::ProbeClientUnavailable)?;
        let runner = Arc::new(ManagerProbeRunner { manager, client });
        let started_at_utc_ms = current_time_utc_ms().unwrap_or(0);
        Self::try_start_with_runner(runner, started_at_utc_ms, MONITOR_POLL_INTERVAL)
    }

    fn try_start_with_runner<R: MonitorProbeRunner>(
        runner: Arc<R>,
        started_at_utc_ms: i64,
        poll_interval: Duration,
    ) -> Result<Self, ShadowHealthMonitorStartError> {
        let stop = Arc::new(AtomicBool::new(false));
        let worker_stop = stop.clone();
        let worker = thread::Builder::new()
            .name("vault-shadow-health-monitor".to_owned())
            .spawn(move || {
                while !worker_stop.load(Ordering::Acquire) {
                    run_monitor_cycle(&runner, started_at_utc_ms);
                    if worker_stop.load(Ordering::Acquire) {
                        break;
                    }
                    thread::park_timeout(poll_interval);
                }
            })
            .map_err(|_| ShadowHealthMonitorStartError::ThreadUnavailable)?;

        Ok(Self {
            stop,
            worker: Some(worker),
        })
    }

    #[cfg(test)]
    fn start_with_runner<R: MonitorProbeRunner>(
        runner: Arc<R>,
        started_at_utc_ms: i64,
        poll_interval: Duration,
    ) -> Self {
        Self::try_start_with_runner(runner, started_at_utc_ms, poll_interval)
            .expect("test monitor thread must start")
    }
}

impl Drop for ShadowHealthMonitor {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            worker.thread().unpark();
            let _ = worker.join();
        }
    }
}

fn run_monitor_cycle<R: MonitorProbeRunner>(runner: &Arc<R>, started_at_utc_ms: i64) {
    let Some(now_utc_ms) = current_time_utc_ms() else {
        return;
    };
    let Ok(summaries) = runner.list_summaries() else {
        return;
    };
    let planned = plan_shadow_health_probes(&summaries, started_at_utc_ms, now_utc_ms);
    if planned.is_empty() {
        return;
    }

    thread::scope(|scope| {
        for plan in planned {
            let runner = runner.clone();
            scope.spawn(move || {
                let _ = runner.probe(&plan.key_id, now_utc_ms);
            });
        }
    });
}

fn current_time_utc_ms() -> Option<i64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis();
    i64::try_from(millis).ok()
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};

    use super::*;

    struct FakeRunner {
        summaries: Mutex<Vec<KeySummary>>,
        cycle_count: AtomicUsize,
        probe_count: AtomicUsize,
        active: AtomicUsize,
        max_active: AtomicUsize,
        probe_delay: Duration,
        fail_probes: bool,
    }

    impl FakeRunner {
        fn new(summaries: Vec<KeySummary>, probe_delay: Duration, fail_probes: bool) -> Self {
            Self {
                summaries: Mutex::new(summaries),
                cycle_count: AtomicUsize::new(0),
                probe_count: AtomicUsize::new(0),
                active: AtomicUsize::new(0),
                max_active: AtomicUsize::new(0),
                probe_delay,
                fail_probes,
            }
        }
    }

    impl MonitorProbeRunner for FakeRunner {
        fn list_summaries(&self) -> Result<Vec<KeySummary>, ()> {
            self.cycle_count.fetch_add(1, Ordering::SeqCst);
            Ok(self.summaries.lock().unwrap().clone())
        }

        fn probe(&self, key_id: &KeyId, now_utc_ms: i64) -> Result<(), ()> {
            let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
            self.max_active.fetch_max(active, Ordering::SeqCst);
            self.probe_count.fetch_add(1, Ordering::SeqCst);
            thread::sleep(self.probe_delay);
            if let Some(summary) = self
                .summaries
                .lock()
                .unwrap()
                .iter_mut()
                .find(|summary| summary.key_id == *key_id)
            {
                summary.last_probe_at_utc_ms = Some(now_utc_ms);
            }
            self.active.fetch_sub(1, Ordering::SeqCst);
            if self.fail_probes {
                Err(())
            } else {
                Ok(())
            }
        }
    }

    fn ready_summary(slot: i64) -> KeySummary {
        KeySummary {
            key_id: KeyId(format!("service-key-{slot:02}")),
            slot_index: slot,
            label: format!("Service {slot}"),
            masked_suffix: format!("••••{slot:04}"),
            lifecycle_state: LifecycleState::Enabled,
            availability_state: AvailabilityState::Ready,
            cooldown_until_utc_ms: None,
            consecutive_failures: 0,
            last_success_at_utc_ms: None,
            last_failure_at_utc_ms: None,
            last_failure_class: None,
            last_probe_at_utc_ms: Some(0),
            limit_value: None,
            limit_remaining: None,
            limit_reset: None,
            usage_daily: None,
            is_free_tier: None,
            expires_at_utc_ms: None,
        }
    }

    fn wait_for_probe_count(runner: &FakeRunner, minimum: usize) {
        let deadline = Instant::now() + Duration::from_secs(2);
        while runner.probe_count.load(Ordering::SeqCst) < minimum {
            assert!(
                Instant::now() < deadline,
                "monitor did not make expected progress"
            );
            thread::sleep(Duration::from_millis(2));
        }
    }

    fn wait_for_cycle_count(runner: &FakeRunner, minimum: usize) {
        let deadline = Instant::now() + Duration::from_secs(2);
        while runner.cycle_count.load(Ordering::SeqCst) < minimum {
            assert!(
                Instant::now() < deadline,
                "monitor did not run the expected cycle"
            );
            thread::sleep(Duration::from_millis(2));
        }
    }

    #[test]
    fn background_worker_never_exceeds_two_concurrent_probes_and_shutdown_is_final() {
        let runner = Arc::new(FakeRunner::new(
            (0..20).map(ready_summary).collect(),
            Duration::from_millis(15),
            false,
        ));
        let monitor =
            ShadowHealthMonitor::start_with_runner(runner.clone(), 0, Duration::from_millis(2));
        wait_for_probe_count(&runner, 4);
        assert!(runner.max_active.load(Ordering::SeqCst) <= MONITOR_MAX_CONCURRENT_PROBES);

        drop(monitor);
        let after_shutdown = runner.probe_count.load(Ordering::SeqCst);
        thread::sleep(Duration::from_millis(30));
        assert_eq!(runner.probe_count.load(Ordering::SeqCst), after_shutdown);
    }

    #[test]
    fn restart_does_not_immediately_duplicate_a_recent_probe() {
        let runner = Arc::new(FakeRunner::new(
            vec![ready_summary(0)],
            Duration::from_millis(1),
            false,
        ));
        let first =
            ShadowHealthMonitor::start_with_runner(runner.clone(), 0, Duration::from_millis(2));
        wait_for_probe_count(&runner, 1);
        drop(first);
        let after_first = runner.probe_count.load(Ordering::SeqCst);
        let cycles_before_restart = runner.cycle_count.load(Ordering::SeqCst);

        let second = ShadowHealthMonitor::start_with_runner(
            runner.clone(),
            current_time_utc_ms().unwrap(),
            Duration::from_millis(2),
        );
        wait_for_cycle_count(&runner, cycles_before_restart + 1);
        drop(second);
        assert_eq!(runner.probe_count.load(Ordering::SeqCst), after_first);
    }

    #[test]
    fn provider_outage_does_not_make_fake_pool_ineligible_or_break_monitor_lifecycle() {
        let runner = Arc::new(FakeRunner::new(
            (0..20).map(ready_summary).collect(),
            Duration::from_millis(2),
            true,
        ));
        let monitor =
            ShadowHealthMonitor::start_with_runner(runner.clone(), 0, Duration::from_millis(2));
        wait_for_probe_count(&runner, 2);
        drop(monitor);

        assert!(runner.summaries.lock().unwrap().iter().all(|summary| {
            summary.lifecycle_state == LifecycleState::Enabled
                && summary.availability_state == AvailabilityState::Ready
        }));
    }
}
