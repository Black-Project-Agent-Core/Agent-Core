use crate::FailureClass;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClassifiedOutcome {
    pub failure_class: FailureClass,
    pub rotate: bool,
    pub retry_after_ms: Option<u64>,
}

pub fn classify_status(status: u16, retry_hint: Option<u64>) -> ClassifiedOutcome {
    let (failure_class, rotate) = match status {
        401 => (FailureClass::AuthInvalid, true),
        402 => (FailureClass::CreditBlocked, true),
        403 => (FailureClass::PermissionBlocked, true),
        429 => (FailureClass::RateLimited, true),
        400 | 422 => (FailureClass::RequestInvalid, false),
        408 | 500 | 502 | 503 | 524 | 529 => (FailureClass::ProviderTransient, false),
        _ => (FailureClass::Unknown, false),
    };
    ClassifiedOutcome {
        failure_class,
        rotate,
        retry_after_ms: if failure_class == FailureClass::RateLimited {
            retry_hint
        } else {
            None
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::FailureClass;

    #[test]
    fn http_statuses_map_to_exact_failure_semantics() {
        let cases = [
            (401, FailureClass::AuthInvalid, true),
            (402, FailureClass::CreditBlocked, true),
            (403, FailureClass::PermissionBlocked, true),
            (429, FailureClass::RateLimited, true),
            (400, FailureClass::RequestInvalid, false),
            (422, FailureClass::RequestInvalid, false),
            (408, FailureClass::ProviderTransient, false),
            (500, FailureClass::ProviderTransient, false),
            (502, FailureClass::ProviderTransient, false),
            (503, FailureClass::ProviderTransient, false),
            (524, FailureClass::ProviderTransient, false),
            (529, FailureClass::ProviderTransient, false),
            (418, FailureClass::Unknown, false),
        ];

        for (status, expected_class, expected_rotate) in cases {
            let outcome = classify_status(status, None);
            assert_eq!(outcome.failure_class, expected_class, "status={status}");
            assert_eq!(outcome.rotate, expected_rotate, "status={status}");
        }
    }

    #[test]
    fn retry_hint_is_preserved_only_for_rate_limit_classification() {
        assert_eq!(classify_status(429, Some(7_500)).retry_after_ms, Some(7_500));
        assert_eq!(classify_status(503, Some(7_500)).retry_after_ms, None);
    }
}
