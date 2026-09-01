use agent_code_credential_core::{ProtectError, ProtectedBlob, SecretBytes, SecretProtector};
use std::{ptr::{null, null_mut}, slice};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN,
    },
};

pub struct DpapiProtector;

struct LocalBlob(CRYPT_INTEGER_BLOB);

impl LocalBlob {
    fn copy_bytes(&self, error: ProtectError) -> Result<Vec<u8>, ProtectError> {
        if self.0.pbData.is_null() || self.0.cbData == 0 {
            return Err(error);
        }
        Ok(unsafe { slice::from_raw_parts(self.0.pbData, self.0.cbData as usize).to_vec() })
    }

    fn zeroize_contents(&mut self) {
        if !self.0.pbData.is_null() && self.0.cbData > 0 {
            unsafe {
                std::ptr::write_bytes(self.0.pbData, 0, self.0.cbData as usize);
            }
        }
    }
}

impl Drop for LocalBlob {
    fn drop(&mut self) {
        if !self.0.pbData.is_null() {
            unsafe {
                let _ = LocalFree(self.0.pbData.cast());
            }
            self.0.pbData = null_mut();
            self.0.cbData = 0;
        }
    }
}

impl SecretProtector for DpapiProtector {
    fn protect(&self, secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError> {
        secret.expose_bytes(|bytes| {
            let input = CRYPT_INTEGER_BLOB {
                cbData: u32::try_from(bytes.len()).map_err(|_| ProtectError::ProtectFailed)?,
                pbData: bytes.as_ptr().cast_mut(),
            };
            let mut output = CRYPT_INTEGER_BLOB::default();
            let ok = unsafe {
                CryptProtectData(
                    &input,
                    null(),
                    null(),
                    null(),
                    null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            };
            if ok == 0 {
                return Err(ProtectError::ProtectFailed);
            }
            let output = LocalBlob(output);
            Ok(ProtectedBlob::new(output.copy_bytes(ProtectError::ProtectFailed)?))
        })
    }

    fn unprotect(&self, protected: &ProtectedBlob) -> Result<SecretBytes, ProtectError> {
        if !protected.verify_checksum() {
            return Err(ProtectError::IntegrityFailed);
        }

        let input_bytes = protected.as_bytes();
        let input = CRYPT_INTEGER_BLOB {
            cbData: u32::try_from(input_bytes.len()).map_err(|_| ProtectError::UnprotectFailed)?,
            pbData: input_bytes.as_ptr().cast_mut(),
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                null_mut(),
                null(),
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(ProtectError::UnprotectFailed);
        }

        let mut output = LocalBlob(output);
        let plaintext = output.copy_bytes(ProtectError::UnprotectFailed)?;
        output.zeroize_contents();
        SecretBytes::from_decrypted(plaintext).map_err(|_| ProtectError::UnprotectFailed)
    }
}
