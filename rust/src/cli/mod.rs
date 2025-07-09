//! CLI module for the gridless radio astronomy imaging tool
//!
//! This module provides a clean separation between CLI concerns and business logic.
//! It handles argument parsing, validation, file I/O, and output formatting.

pub mod args;
pub mod error;
pub mod output;

use self::args::Args;
use self::error::CliError;
use clap::Parser;
use std::fs::File;
use std::io::Read;
use std::time::Instant;

/// Main CLI entry point - orchestrates the entire CLI workflow
pub fn run() -> Result<(), CliError> {
    let args = Args::parse();

    // Validate arguments
    args.validate()?;

    let start_time = Instant::now();

    // Read input file
    let mut file = File::open(&args.file)?;
    let mut json = String::new();
    file.read_to_string(&mut json)?;

    // Convert CLI args to processing config
    let config = crate::ProcessingConfig::from(&args);

    // Call the business logic (no CLI concerns)
    let (svg_data, timestamp) = crate::process_json_data(&json, &config)
        .map_err(|e| CliError::Processing(e.to_string()))?;

    // Handle output
    output::write_svg_output(&svg_data, &timestamp, args.output.as_deref(), start_time)?;

    Ok(())
}
