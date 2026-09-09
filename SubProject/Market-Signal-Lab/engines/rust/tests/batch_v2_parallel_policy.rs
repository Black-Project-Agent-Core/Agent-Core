use msl_analytics_rust::batch_v2::adaptive_worker_count;

#[test]
fn adaptive_parallelism_obeys_threshold_and_caps() {
    assert_eq!(adaptive_worker_count(1, 1_000_000, 8), 1);
    assert_eq!(adaptive_worker_count(2, 99_999, 8), 1);
    assert_eq!(adaptive_worker_count(2, 100_000, 8), 2);
    assert_eq!(adaptive_worker_count(4, 100_000, 16), 4);
    assert_eq!(adaptive_worker_count(8, 100_000, 16), 4);
    assert_eq!(adaptive_worker_count(4, 100_000, 2), 2);
    assert_eq!(adaptive_worker_count(4, 100_000, 1), 1);
}
