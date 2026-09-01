use std::fmt;

use subtle::ConstantTimeEq;
use thiserror::Error;
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SecretBytes(Vec<u8>);

#[derive(Debug, Error, PartialEq, Eq)]
pub enum SecretValidationError {
    #[error("credential length is outside the accepted range")]
    InvalidLength,
    #[error("credential contains whitespace or control bytes")]
    InvalidCharacters,
}

impl SecretBytes {
    pub fn parse_import(mut value: String) -> Result<Self, SecretValidationError> {
        let bytes = value.as_bytes();
        let valid_len = (16..=512).contains(&bytes.len());
        let valid_chars = bytes.iter().all(|byte| byte.is_ascii_graphic());
        if !valid_len || !valid_chars {
            value.zeroize();
            return Err(if valid_len {
                SecretValidationError::InvalidCharacters
            } else {
                SecretValidationError::InvalidLength
            });
        }
        let owned = bytes.to_vec();
        value.zeroize();
        Ok(Self(owned))
    }

    pub fn from_decrypted(mut bytes: Vec<u8>) -> Result<Self, SecretValidationError> {
        let valid_len = (16..=512).contains(&bytes.len());
        let valid_chars = bytes.iter().all(|byte| byte.is_ascii_graphic());
        if !valid_len || !valid_chars {
            bytes.zeroize();
            return Err(if valid_len {
                SecretValidationError::InvalidCharacters
            } else {
                SecretValidationError::InvalidLength
            });
        }
        Ok(Self(bytes))
    }

    pub fn expose_bytes<R>(&self, f: impl FnOnce(&[u8]) -> R) -> R {
        f(&self.0)
    }

    pub fn ct_eq(&self, other: &Self) -> bool {
        if self.0.len() != other.0.len() {
            return false;
        }
        self.0.as_slice().ct_eq(other.0.as_slice()).into()
    }

    pub fn masked_suffix(&self) -> String {
        let suffix = &self.0[self.0.len().saturating_sub(4)..];
        format!("••••{}", String::from_utf8_lossy(suffix))
    }
}

impl fmt::Debug for SecretBytes {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[REDACTED]")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_debug_is_always_redacted_and_mask_is_suffix_only() {
        let secret = SecretBytes::parse_import("sk-or-v1-THIS_IS_A_SYNTHETIC_CANARY_3Fxa".to_owned()).unwrap();
        assert_eq!(format!("{secret:?}"), "[REDACTED]");
        assert_eq!(secret.masked_suffix(), "••••3Fxa");
    }

    #[test]
    fn import_rejects_whitespace_control_and_unreasonably_short_values() {
        assert!(SecretBytes::parse_import(" short ".to_owned()).is_err());
        assert!(SecretBytes::parse_import("abc\n0123456789012345".to_owned()).is_err());
    }

    #[test]
    fn decrypted_bytes_are_validated_without_round_tripping_through_string() {
        let secret = SecretBytes::from_decrypted(b"sk-or-v1-SYNTHETIC_DECRYPTED_1234".to_vec()).unwrap();
        assert_eq!(secret.masked_suffix(), "••••1234");
        assert!(SecretBytes::from_decrypted(vec![b'a'; 15]).is_err());
    }

    #[test]
    fn constant_time_equality_requires_equal_length_and_content() {
        let a = SecretBytes::parse_import("sk-or-v1-SYNTHETIC_EQUAL_1234".to_owned()).unwrap();
        let b = SecretBytes::parse_import("sk-or-v1-SYNTHETIC_EQUAL_1234".to_owned()).unwrap();
        let c = SecretBytes::parse_import("sk-or-v1-SYNTHETIC_OTHER_5678".to_owned()).unwrap();
        assert!(a.ct_eq(&b));
        assert!(!a.ct_eq(&c));
    }
}
