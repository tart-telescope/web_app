//! Template-based SVG generation for radio astronomy visualizations.
//!
//! This module provides data structures for generating SVG visualizations
//! of hemisphere data using direct string construction for maximum
//! performance and precise control over SVG output.

pub mod hemisphere_template;

pub use hemisphere_template::*;

/// Error types for template operations
#[derive(Debug, thiserror::Error)]
pub enum TemplateError {
    #[error("Render error: {0}")]
    RenderError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Template not found: {0}")]
    TemplateNotFound(String),

    #[error("Invalid context: {0}")]
    InvalidContext(String),
}

pub type TemplateResult<T> = Result<T, TemplateError>;

impl From<Box<dyn std::error::Error>> for TemplateError {
    fn from(e: Box<dyn std::error::Error>) -> Self {
        TemplateError::RenderError(e.to_string())
    }
}
