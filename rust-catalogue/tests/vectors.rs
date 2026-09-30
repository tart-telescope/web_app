//! Verification against the catalogue project's own astropy-generated vectors.
//!
//! `test_vectors.json` is vendored from `tart-telescope/catalogue`
//! (`test-vectors/test_vectors.json`). It pairs a single GPS TLE with an
//! observer and four time offsets, giving TEME/ECEF state vectors and the
//! expected topocentric look angles.
//!
//! These tests are the correctness gate for the whole crate: they run natively
//! (`cargo test`) with no browser and no network.

use serde::Deserialize;
use tart_catalogue_wasm::geo;
use tart_catalogue_wasm::propagation::{self, TleRecord};
use tart_catalogue_wasm::time::rotation_sin_cos;

const VECTORS: &str = include_str!("test_vectors.json");

#[derive(Deserialize)]
struct Vectors {
    tle: TleRecord,
    observer: Observer,
    dates: Vec<DateEntry>,
    horizontal: Vec<HorizontalEntry>,
}

#[derive(Deserialize)]
struct Observer {
    lat_deg: f64,
    lon_deg: f64,
    alt_m: f64,
}

#[derive(Deserialize)]
struct DateEntry {
    date: String,
    offset_h: f64,
    teme_km: [f64; 3],
    ecef_km: [f64; 3],
}

#[derive(Deserialize)]
struct HorizontalEntry {
    azimuth_deg: f64,
    elevation_deg: f64,
    range_km: f64,
    offset_h: f64,
}

fn vectors() -> Vectors {
    serde_json::from_str(VECTORS).expect("test_vectors.json should parse")
}

fn unix_secs(iso: &str) -> f64 {
    chrono::DateTime::parse_from_rfc3339(iso)
        .expect("vector date should be RFC3339")
        .timestamp() as f64
}

/// The headline correctness test: our SGP4 -> TEME -> ECEF -> ENU pipeline
/// must reproduce the astropy reference to within the same tolerance the
/// upstream Python client uses (0.1 deg).
#[test]
fn horizontal_matches_astropy_vectors() {
    let v = vectors();
    let (propagators, skipped) = propagation::build_propagators(std::slice::from_ref(&v.tle));
    assert_eq!(skipped, 0, "the reference TLE should parse");
    assert_eq!(propagators.len(), 1);

    for (date, expected) in v.dates.iter().zip(v.horizontal.iter()) {
        assert!(
            (date.offset_h - expected.offset_h).abs() < 1e-9,
            "vectors should be parallel"
        );

        // min_el = -90.0: one reference vector is below the horizon
        // (-1.27 deg), and a default 0.0 filter would silently drop it and
        // make this test pass with an empty result.
        let results = propagation::horizontal_positions_at(
            &propagators,
            unix_secs(&date.date),
            v.observer.lat_deg,
            v.observer.lon_deg,
            v.observer.alt_m,
            -90.0,
        );

        assert_eq!(results.len(), 1, "expected one result at offset {}", date.offset_h);
        let got = &results[0];

        let daz = (got.az_deg - expected.azimuth_deg).abs();
        let del = (got.el_deg - expected.elevation_deg).abs();
        let drng = (got.range_km - expected.range_km).abs();

        assert!(
            daz < 0.1,
            "azimuth at offset {}h: got {:.6}, expected {:.6} (delta {:.6})",
            date.offset_h,
            got.az_deg,
            expected.azimuth_deg,
            daz
        );
        assert!(
            del < 0.1,
            "elevation at offset {}h: got {:.6}, expected {:.6} (delta {:.6})",
            date.offset_h,
            got.el_deg,
            expected.elevation_deg,
            del
        );
        assert!(
            drng < 1.0,
            "range at offset {}h: got {:.6}, expected {:.6} (delta {:.6})",
            date.offset_h,
            got.range_km,
            expected.range_km,
            drng
        );
    }
}

/// Regression test for the unit bug in the upstream Rust client.
///
/// It computes the propagation interval as `julian_day(dt) - 2433281.5`
/// (days since 1949-12-31) minus `Elements::epoch()` (YEARS since J2000),
/// which is dimensionally invalid and lands ~74 years away from the truth.
///
/// At the TLE's own epoch the interval must be zero. This fails loudly if
/// anyone reintroduces the upstream expression.
#[test]
fn minutes_since_epoch_is_zero_at_the_tle_epoch() {
    let v = vectors();
    let elements = sgp4::Elements::from_tle(
        Some(v.tle.name.clone()),
        v.tle.line1.as_bytes(),
        v.tle.line2.as_bytes(),
    )
    .expect("reference TLE should parse");

    let at_epoch = elements
        .datetime_to_minutes_since_epoch(&elements.datetime)
        .expect("epoch is representable");

    assert!(
        at_epoch.0.abs() < 1e-6,
        "propagation interval at the TLE epoch should be 0, got {} minutes",
        at_epoch.0
    );

    // Guard the scale explicitly: the epoch is years since J2000 on a 365.25
    // day year, ~26.45 years for this 2024 TLE. The upstream bug would make
    // the interval ~3.9e7 minutes rather than ~0.
    let years = elements.epoch();
    assert!(
        (24.0..27.0).contains(&years),
        "epoch should be years since J2000, got {years}"
    );
}

/// The TEME -> ECEF rotation must match the one astropy used to produce the
/// reference `ecef_km` values.
#[test]
fn gmst_rotation_reproduces_the_reference_ecef() {
    let v = vectors();

    for date in &v.dates {
        let rotation = rotation_sin_cos(unix_secs(&date.date));
        let (s, c) = rotation;

        let got = [
            c * date.teme_km[0] - s * date.teme_km[1],
            s * date.teme_km[0] + c * date.teme_km[1],
            date.teme_km[2],
        ];

        for axis in 0..3 {
            let delta = (got[axis] - date.ecef_km[axis]).abs();
            assert!(
                delta < 0.5,
                "TEME->ECEF axis {axis} at offset {}h differs by {delta:.6} km",
                date.offset_h
            );
        }
    }
}

/// The observer/ENU layer must reproduce the reference angles when fed the
/// authoritative ECEF position, isolating it from SGP4 entirely.
#[test]
fn enu_matches_astropy_given_reference_ecef() {
    let v = vectors();
    let observer = geo::geodetic_to_ecef(v.observer.lat_deg, v.observer.lon_deg, v.observer.alt_m);

    for (date, expected) in v.dates.iter().zip(v.horizontal.iter()) {
        let h = geo::horizontal_from_ecef(
            date.ecef_km,
            observer,
            v.observer.lat_deg,
            v.observer.lon_deg,
        );

        assert!(
            (h.az_deg - expected.azimuth_deg).abs() < 0.01,
            "azimuth at offset {}h: got {:.6}, expected {:.6}",
            date.offset_h,
            h.az_deg,
            expected.azimuth_deg
        );
        assert!(
            (h.el_deg - expected.elevation_deg).abs() < 0.01,
            "elevation at offset {}h: got {:.6}, expected {:.6}",
            date.offset_h,
            h.el_deg,
            expected.elevation_deg
        );
        assert!(
            (h.range_km - expected.range_km).abs() < 0.01,
            "range at offset {}h: got {:.6}, expected {:.6}",
            date.offset_h,
            h.range_km,
            expected.range_km
        );
    }
}

/// The bulk path must agree exactly with repeated single-instant calls, so the
/// shared observer/rotation optimisation cannot silently drift.
#[test]
fn bulk_agrees_with_single_calls() {
    let v = vectors();
    let (propagators, _) = propagation::build_propagators(std::slice::from_ref(&v.tle));
    let times: Vec<f64> = v.dates.iter().map(|d| unix_secs(&d.date)).collect();

    let bulk = propagation::horizontal_positions_bulk(
        &propagators,
        &times,
        v.observer.lat_deg,
        v.observer.lon_deg,
        v.observer.alt_m,
        -90.0,
    );

    assert_eq!(bulk.len(), times.len());

    for (i, t) in times.iter().enumerate() {
        let single = propagation::horizontal_positions_at(
            &propagators,
            *t,
            v.observer.lat_deg,
            v.observer.lon_deg,
            v.observer.alt_m,
            -90.0,
        );
        assert_eq!(single.len(), bulk[i].len());
        assert!((single[0].az_deg - bulk[i][0].az_deg).abs() < 1e-12);
        assert!((single[0].el_deg - bulk[i][0].el_deg).abs() < 1e-12);
        assert!((single[0].range_km - bulk[i][0].range_km).abs() < 1e-12);
    }
}

#[test]
fn malformed_tles_are_skipped_not_fatal() {
    let good = vectors().tle;
    let mut bad = good.clone();
    bad.name = "BROKEN".to_string();
    bad.line1 = "this is not a tle".to_string();

    let (propagators, skipped) = propagation::build_propagators(&[good, bad]);
    assert_eq!(propagators.len(), 1, "the valid TLE should still propagate");
    assert_eq!(skipped, 1);
}

#[test]
fn min_elevation_filter_applies() {
    let v = vectors();
    let (propagators, _) = propagation::build_propagators(std::slice::from_ref(&v.tle));
    let t = unix_secs(&v.dates[0].date);

    let all = propagation::horizontal_positions_at(
        &propagators,
        t,
        v.observer.lat_deg,
        v.observer.lon_deg,
        v.observer.alt_m,
        -90.0,
    );
    let none = propagation::horizontal_positions_at(
        &propagators,
        t,
        v.observer.lat_deg,
        v.observer.lon_deg,
        v.observer.alt_m,
        90.0,
    );

    assert_eq!(all.len(), 1);
    assert_eq!(none.len(), 0);
}
