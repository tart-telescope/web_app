use clap::Parser;
use std::path::Path;

/// Gridless radio astronomy imaging
#[derive(Parser, Debug)]
#[command(name = "gridless")]
#[command(about = "Gridless deconvolution for radio astronomy imaging")]
#[command(
    long_about = "Performs gridless deconvolution on radio astronomy data to generate sky images"
)]
pub struct Args {
    /// HEALPix nside parameter (must be a power of 2)
    #[arg(long = "nside")]
    pub nside: u32,

    /// Show source positions on the output image
    #[arg(long = "sources")]
    pub show_sources: bool,

    /// Input JSON data file
    #[arg(long = "file", default_value = "data.json")]
    pub file: String,

    /// Show statistics overlay
    #[arg(long = "stats")]
    pub show_stats: bool,

    /// Show colorbar
    #[arg(long = "colorbar")]
    pub show_colorbar: bool,

    /// Output SVG file name (auto-generated if not specified)
    #[arg(short, long)]
    pub output: Option<String>,
}

impl Args {
    /// Validate command line arguments
    pub fn validate(&self) -> Result<(), super::error::CliError> {
        // Check nside is valid ( > 0)
        if self.nside == 0 {
            return Err(super::error::CliError::InvalidNside(self.nside));
        }

        // Check input file exists
        if !Path::new(&self.file).exists() {
            return Err(super::error::CliError::FileNotFound(self.file.clone()));
        }

        Ok(())
    }
}

/// Convert CLI args to library processing configuration
impl From<&Args> for crate::ProcessingConfig {
    fn from(args: &Args) -> Self {
        Self {
            nside: args.nside,
            show_sources: args.show_sources,
            show_stats: args.show_stats,
            show_colorbar: args.show_colorbar,
        }
    }
}
