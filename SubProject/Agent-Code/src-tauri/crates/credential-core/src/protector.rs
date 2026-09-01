use std::fmt;

use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use thiserror::Error;

use crate::SecretBytes;

#[derive(Clone)]
pub struct ProtectedBlob {
    bytes: Vec<u8>,
    sha256: [u8; 32],
}

impl ProtectedBlob {
    pub fn new(bytes: Vec<u8>) -> Self {
        let sha256: [u8; 32] = Sha256::digest(&bytes).into();
        Self { bytes, sha256 }
    }

    pub fn from_parts(bytes: Vec<u8>, sha256: [u8; 32]) -> Self {
        Self { bytes, sha256 }
    }

    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes
    }

    pub fn checksum(&self) -> &[u8; 32] {
        &self.sha256
    }

    pub fn verify_checksum(&self) -> bool {
        let current: [u8; 32] = Sha256::digest(&self.bytes).into();
        current.as_slice().ct_eq(self.sha256.as_slice()).into()
    }
}

impl fmt::Debug for ProtectedBlob {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ProtectedBlob")
            .field("len", &self.bytes.len())
            .field("checksum", &"[SHA256]")
            .finish()
    }
}

#[derive(Debug, Error)]
pub enum ProtectError {
    #[error("credential protection failed")]
    ProtectFailed,
    #[error("credential decryption failed")]
    UnprotectFailed,
    #[error("protected credential failed integrity verification")]
    IntegrityFailed,
    #[error("credential protection is unavailable on this platform")]
    UnsupportedPlatform,
}

pub trait SecretProtector: Send + Sync + 'static {
    fn protect(&self, secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError>;
    fn unprotect(&self, protected: &ProtectedBlob) -> Result<SecretBytes, ProtectError>;
}

#[cfg(test)]
mod tests {
    use crate::SecretBytes;
    use super::*;

    struct XorTestProtector(u8);

    impl XorTestProtector {
        fn new(mask: u8) -> Self {
            Self(mask)
        }
    }

    impl SecretProtector for XorTestProtector {
        fn protect(&self, secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError> {
            Ok(ProtectedBlob::new(secret.expose_bytes(|bytes| bytes.iter().map(|byte| byte ^ self.0).collect())))
        }

        fn unprotect(&self, protected: &ProtectedBlob) -> Result<SecretBytes, ProtectError> {
            if !protected.verify_checksum() {
                return Err(ProtectError::IntegrityFailed);
            }
            SecretBytes::from_decrypted(protected.as_bytes().iter().map(|byte| byte ^ self.0).collect())
                .map_err(|_| ProtectError::UnprotectFailed)
        }
    }

    #[test]
    fn protected_blob_detects_ciphertext_mutation() {
        let blob = ProtectedBlob::new(vec![1, 2, 3, 4]);
        assert!(blob.verify_checksum());
        let mut bytes = blob.as_bytes().to_vec();
        bytes[2] ^= 0xff;
        let corrupt = ProtectedBlob::from_parts(bytes, *blob.checksum());
        assert!(!corrupt.verify_checksum());
    }

    #[test]
    fn protected_blob_debug_never_prints_ciphertext() {
        let blob = ProtectedBlob::new(b"synthetic-protected-bytes".to_vec());
        let debug = format!("{blob:?}");
        assert!(!debug.contains("synthetic-protected-bytes"));
        assert!(debug.contains("[SHA256]"));
    }

    #[test]
    fn test_protector_round_trip_keeps_plaintext_out_of_blob() {
        let protector = XorTestProtector::new(0xa5);
        let secret = SecretBytes::parse_import("sk-or-v1-SYNTHETIC_CANARY_123456".to_owned()).unwrap();
        let protected = protector.protect(&secret).unwrap();
        let protected_bytes = protected.as_bytes().to_vec();
        assert!(!protected_bytes.windows(b"SYNTHETIC_CANARY".len()).any(|w| w == b"SYNTHETIC_CANARY"));
        let recovered = protector.unprotect(&protected).unwrap();
        assert!(recovered.ct_eq(&secret));
    }
}
