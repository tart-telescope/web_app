// Copyright (c) 2019-2021 Tim Molteno tim@elec.ac.nz
//

use crate::template::hemisphere_template::{HemisphereBuilder, HemisphereTemplate, SourceMarker};
#[cfg(target_arch = "wasm32")]
use crate::wasm::sphere_plot_simd;

use crate::utils::{VectorReal, median};
use cdshealpix::ring::hash;

use crate::sphere::{ElAz, Hemisphere, HpAngle, LonLat};

use crate::tart_api::Source;

struct PlotCoords {
    #[allow(dead_code)]
    w: i32,
    center: i32,
    scale: f32,
    line_size: u32,
}

impl PlotCoords {
    pub fn new(w: i32) -> PlotCoords {
        let scale = (w as f32) / 2.1;
        let center = ((w as f32) / 2.0).round() as i32;

        let line_size = (w / 400) as u32;

        PlotCoords {
            w,
            center,
            scale,
            line_size,
        }
    }

    #[inline]
    fn from_d(&self, d: f32) -> u32 {
        (d * self.scale).round() as u32
    }

    #[inline]
    fn from_x(&self, x: f32) -> i32 {
        (x * self.scale).round() as i32 + self.center
    }

    #[inline]
    fn from_y(&self, y: f32) -> i32 {
        (y * self.scale).round() as i32 + self.center
    }

    // Optimized version that combines coordinate transformations
    #[inline]
    fn from_xy(&self, x: f32, y: f32) -> (i32, i32) {
        let x_scaled = (x * self.scale).round() as i32 + self.center;
        let y_scaled = (y * self.scale).round() as i32 + self.center;
        (x_scaled, y_scaled)
    }

    fn from_elaz(&self, elaz: &ElAz) -> (i32, i32) {
        let hp = elaz.to_hp();
        let (x, y) = hp.proj();
        self.from_xy(x, y)
    }
}

impl Hemisphere {
    #[allow(dead_code)]
    pub fn get_pix(&self, hp: &HpAngle) -> u64 {
        let lonlat = LonLat::from_hp(hp);
        // Clamp latitude to valid range to avoid precision issues at boundaries
        let lat_clamped = (lonlat.lat as f64).clamp(-std::f64::consts::FRAC_PI_2, std::f64::consts::FRAC_PI_2);
        hash(self.nside, lonlat.lon as f64, lat_clamped)
    }

    pub fn to_svg(&self, show_grid: bool, sources: Option<&Vec<Source>>) -> HemisphereTemplate {
        self.to_svg_with_features(show_grid, sources, false, true)
    }

    pub fn to_svg_with_features(
        &self,
        show_grid: bool,
        sources: Option<&Vec<Source>>,
        show_stats: bool,
        show_colorbar: bool,
    ) -> HemisphereTemplate {
        let w = 4000;
        let pc = PlotCoords::new(w);
        let line_size = pc.line_size;

        // Pre-compute frequently used values
        let center_x = pc.from_x(0.0);
        let center_y = pc.from_y(0.0);

        // Calculate statistics in a single optimized pass using SIMD when available
        let statistics = self.calculate_statistics_optimized();
        let (min_p, max_p, mean_p, sdev_p, mad_p, med) = statistics;

        // Pre-compute range for color mapping
        let color_range = max_p - min_p;
        let inv_color_range = if color_range > 0.0 {
            1.0 / color_range
        } else {
            0.0
        };

        // Start building the template
        let mut builder = HemisphereBuilder::new()
            .astronomy_theme()
            .with_hemisphere_stats(self.npix, min_p, max_p, mean_p, sdev_p, mad_p, med);

        // Enable stats display if requested
        if show_stats {
            builder = builder.show_stats(true);
        }

        // Use SIMD-optimized pixel processing when available
        let (computed_coords, valid_pixels) = self.process_hemisphere_pixels_optimized(
            pc.scale,
            center_x,
            center_y,
            min_p,
            inv_color_range,
        );

        // Set coordinates and add pixels to builder
        builder = builder.with_coords(computed_coords);
        for pixel in valid_pixels {
            builder = builder.add_pixel(pixel);
        }

        // Add grid if requested
        if show_grid {
            builder = builder
                .add_elevation_circles(center_x, center_y, line_size)
                .add_azimuth_lines(center_x, center_y);
        }

        builder = builder.show_grid(show_grid);

        // Add sources if provided
        if let Some(src) = sources {
            let angular_size_rad = 2.0_f32.to_radians();
            let radius = pc.from_d(angular_size_rad);
            let mut source_markers = Vec::with_capacity(src.len());

            for s in src {
                if s.el > 20.0 {
                    let el_rad = s.el.to_radians();
                    let az_rad = s.az.to_radians();
                    let elaz = ElAz::new(el_rad, az_rad);

                    let (x, y) = pc.from_elaz(&elaz);

                    let source_marker =
                        SourceMarker::new(x, y, radius, s.el, s.az, s.name.replace(" ", ""))
                            .with_color("red")
                            .with_stroke_width(line_size);

                    source_markers.push(source_marker);
                }
            }

            if !source_markers.is_empty() {
                builder = builder.with_sources(source_markers);
            }
        }

        // Add colorbar if requested
        if show_colorbar {
            builder = builder.add_cubehelix_colorbar(min_p, max_p);
        }

        builder.build()
    }

    /// Calculate hemisphere statistics with automatic SIMD optimization.
    ///
    /// Computes min, max, mean, standard deviation, median absolute deviation,
    /// and median values using optimized algorithms that automatically use SIMD
    /// when available.
    ///
    /// Returns: (min_p, max_p, mean_p, sdev_p, mad_p, med)
    fn calculate_statistics_optimized(&self) -> (f32, f32, f32, f32, f32, f32) {
        // Calculate statistics in a single optimized pass
        let mut max_p: f32 = f32::NEG_INFINITY;
        let mut min_p: f32 = f32::INFINITY;
        let mut sum_p: f32 = 0.0;
        let mut sum_sq: f32 = 0.0;

        // Single pass for min, max, mean, and variance preparation
        for &p in self.visible_pix.iter() {
            max_p = p.max(max_p);
            min_p = p.min(min_p);
            sum_p += p;
            sum_sq += p * p;
        }

        let npix_f32 = self.npix as f32;
        let mean_p = sum_p / npix_f32;
        let sdev_p = ((sum_sq / npix_f32) - (mean_p * mean_p)).sqrt();

        print!(
            "'N_s':{}, 'S/N': {}, 'min': {}, 'max': {}, 'mean': {}, 'sdev': {}",
            self.npix,
            (max_p / sdev_p),
            min_p,
            max_p,
            mean_p,
            sdev_p
        );

        let med = median(self.visible_pix.as_slice().expect("")).expect("Fail");

        let mut deviation: VectorReal = VectorReal::zeros(self.visible_pix.raw_dim());
        deviation = deviation + &self.visible_pix - med;
        deviation.mapv_inplace(f32::abs);
        let mad_p: f32 = median(deviation.as_slice().expect("")).expect("Fail");

        println!(
            ", 'R_mad': {}, 'MAD': {}, 'median': {}",
            (max_p / mad_p),
            mad_p,
            med
        );

        (min_p, max_p, mean_p, sdev_p, mad_p, med)
    }

    /// Process hemisphere pixels with automatic SIMD optimization.
    ///
    /// Uses WASM SIMD optimizations when available, falls back to scalar otherwise.
    #[cfg(target_arch = "wasm32")]
    fn process_hemisphere_pixels_optimized(
        &self,
        scale: f32,
        center_x: i32,
        center_y: i32,
        min_p: f32,
        inv_color_range: f32,
    ) -> (
        Vec<String>,
        Vec<crate::template::hemisphere_template::HemispherePixel>,
    ) {
        sphere_plot_simd::process_hemisphere_pixels_optimized(
            self,
            scale,
            center_x,
            center_y,
            min_p,
            inv_color_range,
        )
    }

    /// Process hemisphere pixels using scalar operations for non-WASM targets.
    #[cfg(not(target_arch = "wasm32"))]
    fn process_hemisphere_pixels_optimized(
        &self,
        scale: f32,
        center_x: i32,
        center_y: i32,
        min_p: f32,
        inv_color_range: f32,
    ) -> (
        Vec<String>,
        Vec<crate::template::hemisphere_template::HemispherePixel>,
    ) {
        use crate::template::hemisphere_template::HemispherePixel;

        let mut computed_coords = Vec::with_capacity(self.npix);
        let mut valid_pixels = Vec::with_capacity(self.npix);

        // Pre-allocate reusable formatter buffers
        let mut coord_result = String::with_capacity(64);
        let mut x_formatter = itoa::Buffer::new();
        let mut y_formatter = itoa::Buffer::new();

        for i in 0..self.npix {
            let pixel = self.visible_indices[i];
            let corners = self.get_pixel_corners(pixel);
            let value = self.visible_pix[i];

            let mut max_lat = 0.0;
            for &(_, lat) in &corners {
                max_lat = f32::max(max_lat, lat);
            }

            if max_lat > 0.07 {
                let normalized_value = (value - min_p) * inv_color_range;

                // Transform coordinates using scalar operations
                let mut coords = Vec::with_capacity(4);
                for &(lon, lat) in &corners {
                    let ll = LonLat::new(lon, lat);
                    let hp = HpAngle::from_lonlat(&ll);
                    let (x, y) = hp.proj();
                    let transformed_x = (x * scale).round() as i32 + center_x;
                    let transformed_y = (y * scale).round() as i32 + center_y;
                    coords.push((transformed_x, transformed_y));
                }

                // Format coordinates
                self.format_coords_fast(
                    &coords,
                    &mut x_formatter,
                    &mut y_formatter,
                    &mut coord_result,
                );

                let coord_index = computed_coords.len();
                computed_coords.push(coord_result.clone());

                let hemisphere_pixel = HemispherePixel::new(coord_index, normalized_value);
                valid_pixels.push(hemisphere_pixel);
            }
        }

        (computed_coords, valid_pixels)
    }

    /// Get pixel corners as (lon, lat) pairs.
    #[cfg(not(target_arch = "wasm32"))]
    fn get_pixel_corners(&self, pixel: u64) -> [(f32, f32); 4] {
        use cdshealpix::ring::vertices;
        let verts = vertices(self.nside, pixel);
        [
            (verts[0].0 as f32, verts[0].1 as f32),
            (verts[1].0 as f32, verts[1].1 as f32),
            (verts[2].0 as f32, verts[2].1 as f32),
            (verts[3].0 as f32, verts[3].1 as f32),
        ]
    }

    /// Fast coordinate formatter using reusable buffers
    #[cfg(not(target_arch = "wasm32"))]
    fn format_coords_fast(
        &self,
        coords: &[(i32, i32)],
        x_buf: &mut itoa::Buffer,
        y_buf: &mut itoa::Buffer,
        result: &mut String,
    ) {
        result.clear();
        for (i, &(x, y)) in coords.iter().enumerate() {
            if i > 0 {
                result.push(' ');
            }
            result.push_str(x_buf.format(x));
            result.push(',');
            result.push_str(y_buf.format(y));
        }
    }
}
