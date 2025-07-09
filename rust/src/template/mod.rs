//! Template-based SVG generation using Sailfish
//!
//! This module provides an alternative approach to SVG generation using
//! Sailfish templates, offering more flexibility and easier customization
//! for complex visualizations.

use std::collections::HashMap;

pub mod hemisphere_template;

pub use hemisphere_template::*;

/// Common template context data
#[derive(Debug, Clone)]
pub struct TemplateContext {
    pub variables: HashMap<String, String>,
    pub metadata: Option<TemplateMetadata>,
}

/// Metadata for templates
#[derive(Debug, Clone)]
pub struct TemplateMetadata {
    pub generator: String,
    pub version: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub description: Option<String>,
}

impl Default for TemplateMetadata {
    fn default() -> Self {
        Self {
            generator: "gridless-template".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            created_at: chrono::Utc::now(),
            description: None,
        }
    }
}

impl TemplateContext {
    pub fn new() -> Self {
        Self {
            variables: HashMap::new(),
            metadata: Some(TemplateMetadata::default()),
        }
    }

    pub fn with_metadata(mut self, metadata: TemplateMetadata) -> Self {
        self.metadata = Some(metadata);
        self
    }

    pub fn set_variable<K: Into<String>, V: Into<String>>(mut self, key: K, value: V) -> Self {
        self.variables.insert(key.into(), value.into());
        self
    }

    pub fn get_variable(&self, key: &str) -> Option<&String> {
        self.variables.get(key)
    }
}

/// Trait for template-based SVG generation
pub trait SvgTemplate {
    type Context;

    /// Render the template with the given context
    fn render(&self, context: &Self::Context) -> Result<String, sailfish::RenderError>;

    /// Get the template name/identifier
    fn template_name(&self) -> &'static str;
}

/// Error types for template operations
#[derive(Debug, thiserror::Error)]
pub enum TemplateError {
    #[error("Render error: {0}")]
    RenderError(#[from] sailfish::RenderError),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Template not found: {0}")]
    TemplateNotFound(String),

    #[error("Invalid context: {0}")]
    InvalidContext(String),
}

pub type TemplateResult<T> = Result<T, TemplateError>;

/// Template manager for handling multiple templates
pub struct TemplateManager {
    template_dir: std::path::PathBuf,
}

impl TemplateManager {
    pub fn new<P: Into<std::path::PathBuf>>(template_dir: P) -> Self {
        Self {
            template_dir: template_dir.into(),
        }
    }

    pub fn template_path(&self, name: &str) -> std::path::PathBuf {
        self.template_dir.join(format!("{}.stpl", name))
    }

    pub fn template_exists(&self, name: &str) -> bool {
        self.template_path(name).exists()
    }
}

impl Default for TemplateManager {
    fn default() -> Self {
        Self::new("templates")
    }
}
