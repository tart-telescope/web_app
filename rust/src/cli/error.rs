use thiserror::Error;

/// CLI-specific errors with user-friendly messages
#[derive(Error, Debug)]
pub enum CliError {
    #[error("Invalid nside value: {0}. Must be a power of 2 and greater than 0")]
    InvalidNside(u32),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Failed to read file: {0}")]
    FileRead(#[from] std::io::Error),

    #[error("Invalid JSON data: {0}")]
    InvalidJson(#[from] serde_json::Error),

    #[error("Processing failed: {0}")]
    Processing(String),

    #[error("Failed to write output file: {0}")]
    OutputWrite(String),
}

impl CliError {
    /// Get the appropriate exit code for this error
    pub fn exit_code(&self) -> i32 {
        match self {
            CliError::InvalidNside(_) => 2,
            CliError::FileNotFound(_) => 2,
            CliError::FileRead(_) => 1,
            CliError::InvalidJson(_) => 1,
            CliError::Processing(_) => 1,
            CliError::OutputWrite(_) => 1,
        }
    }
}
