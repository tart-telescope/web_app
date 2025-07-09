use crate::cli::error::CliError;
use chrono::{DateTime, Utc};
use std::fs::File;
use std::io::BufWriter;
use std::io::Write;
use std::time::Instant;

/// Handle output formatting and file writing
pub fn write_svg_output(
    svg_data: &str,
    timestamp: &DateTime<Utc>,
    output_file: Option<&str>,
    start_time: Instant,
) -> Result<(), CliError> {
    // Generate filename if not provided
    let filename = output_file.map(|s| s.to_string()).unwrap_or_else(|| {
        let dstring = timestamp.format("%Y_%m_%d_%H_%M_%S_%Z");
        format!("gridless_{}.svg", dstring)
    });

    // Write the SVG file
    let mut output =
        BufWriter::new(File::create(&filename).map_err(|e| CliError::OutputWrite(e.to_string()))?);

    output
        .write_all(svg_data.as_bytes())
        .map_err(|e| CliError::OutputWrite(e.to_string()))?;

    // Print success message
    println!("✓ Generated: {}", filename);
    println!("⏱  Completed in {} ms", start_time.elapsed().as_millis());

    Ok(())
}
