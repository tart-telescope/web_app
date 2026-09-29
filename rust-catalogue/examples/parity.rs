//! Parity harness: compute horizontal positions locally from a vendored
//! `/ephemerides` response and print them as JSON, so they can be diffed
//! against the server's own `/catalog` output for the same inputs.
//!
//! Usage:
//!   cargo run --example parity -- <ephemerides.json> <unix_secs> <lat> <lon> <alt_m>
//!
//! The fetch itself is done by the caller (curl), keeping this crate free of
//! an HTTP client.

use std::env;
use std::fs;
use std::process::ExitCode;

use tart_catalogue_wasm::propagation::{self, TleRecord};

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    if args.len() != 6 {
        eprintln!("usage: parity <ephemerides.json> <unix_secs> <lat> <lon> <alt_m>");
        return ExitCode::FAILURE;
    }

    let Ok(raw) = fs::read_to_string(&args[1]) else {
        eprintln!("could not read {}", args[1]);
        return ExitCode::FAILURE;
    };
    let Ok(records) = serde_json::from_str::<Vec<TleRecord>>(&raw) else {
        eprintln!("could not parse TLE records");
        return ExitCode::FAILURE;
    };

    let unix_secs: f64 = args[2].parse().expect("unix_secs");
    let lat: f64 = args[3].parse().expect("lat");
    let lon: f64 = args[4].parse().expect("lon");
    let alt: f64 = args[5].parse().expect("alt");

    let (propagators, skipped) = propagation::build_propagators(&records);
    eprintln!(
        "{} TLEs, {} propagators built, {} skipped",
        records.len(),
        propagators.len(),
        skipped
    );

    // min_el = -90 so nothing is filtered: the comparison must see every
    // satellite the server could also report.
    let results =
        propagation::horizontal_positions_at(&propagators, unix_secs, lat, lon, alt, -90.0);

    let json: Vec<serde_json::Value> = results
        .iter()
        .map(|s| {
            serde_json::json!({
                "name": s.name,
                "az": s.az_deg,
                "el": s.el_deg,
                "r": s.range_km,
            })
        })
        .collect();

    println!("{}", serde_json::to_string(&json).expect("serialise"));
    ExitCode::SUCCESS
}
