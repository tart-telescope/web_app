//! Template-based SVG generation for radio astronomy hemisphere plots.
//!
//! This module provides data structures and builders for generating SVG
//! visualizations of hemisphere data using manual string construction
//! for maximum performance and precise control over SVG output.
//!
//! The hemisphere template system allows flexible composition of:
//! - Pixel-based sky brightness visualization
//! - Elevation and azimuth grid lines
//! - Known source markers
//! - Statistics overlays
//! - Cubehelix colorbars

use crate::utils::TWO_PI;

/// A pixel in the hemisphere plot
#[derive(Debug, Clone)]
pub struct HemispherePixel {
    pub coord_index: usize,    // Index into coordinates array
    pub normalized_value: f32, // Normalized value for color mapping (0.0 to 1.0)
}

impl HemispherePixel {
    pub fn new(coord_index: usize, normalized_value: f32) -> Self {
        Self {
            coord_index,
            normalized_value,
        }
    }

    /// Get the RGB color for this pixel using the normalized value
    pub fn get_color(&self) -> (u8, u8, u8) {
        cmap(self.normalized_value)
    }

    /// Get the RGB color as a CSS color string using optimized formatting
    pub fn get_color_string(&self) -> String {
        let (r, g, b) = self.get_color();
        let mut result = String::with_capacity(16);
        let mut r_buf = itoa::Buffer::new();
        let mut g_buf = itoa::Buffer::new();
        let mut b_buf = itoa::Buffer::new();

        result.push_str("rgb(");
        result.push_str(r_buf.format(r));
        result.push(',');
        result.push_str(g_buf.format(g));
        result.push(',');
        result.push_str(b_buf.format(b));
        result.push(')');

        result
    }
}

/// Grid circle for elevation lines
#[derive(Debug, Clone)]
pub struct GridCircle {
    pub cx: i32,
    pub cy: i32,
    pub radius: u32,
}

impl GridCircle {
    pub fn new(cx: i32, cy: i32, radius: u32) -> Self {
        Self { cx, cy, radius }
    }
}

/// Grid line for azimuth lines
#[derive(Debug, Clone)]
pub struct GridLine {
    pub x1: i32,
    pub y1: i32,
    pub x2: i32,
    pub y2: i32,
}

impl GridLine {
    pub fn new(x1: i32, y1: i32, x2: i32, y2: i32) -> Self {
        Self { x1, y1, x2, y2 }
    }
}

/// Source marker for known astronomical sources
#[derive(Debug, Clone)]
pub struct SourceMarker {
    pub x: i32,
    pub y: i32,
    pub radius: u32,
    pub color: String,
    pub stroke_width: u32,
    pub elevation: f32,
    pub azimuth: f32,
    pub name: String,
}

impl SourceMarker {
    pub fn new(x: i32, y: i32, radius: u32, elevation: f32, azimuth: f32, name: String) -> Self {
        Self {
            x,
            y,
            radius,
            color: "red".to_string(),
            stroke_width: 2,
            elevation,
            azimuth,
            name,
        }
    }

    pub fn with_color(mut self, color: &str) -> Self {
        self.color = color.to_string();
        self
    }

    pub fn with_stroke_width(mut self, width: u32) -> Self {
        self.stroke_width = width;
        self
    }
}

/// Statistics overlay data
#[derive(Debug, Clone)]
pub struct StatsOverlay {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub background: String,
    pub border_color: String,
    pub border_width: u32,
    pub opacity: f32,
    pub text_color: String,
    pub font_family: String,
    pub font_size: u32,
    // Statistics values
    pub n_pixels: usize,
    pub signal_noise_ratio: f32,
    pub min_value: f32,
    pub max_value: f32,
    pub mean_value: f32,
    pub std_dev: f32,
    pub mad_value: f32,
    pub median_value: f32,
}

impl Default for StatsOverlay {
    fn default() -> Self {
        Self {
            x: 20,
            y: 20,
            width: 280,
            height: 160,
            background: "#1a1a2e".to_string(),
            border_color: "#4a4a6a".to_string(),
            border_width: 1,
            opacity: 0.85,
            text_color: "#e0e0e0".to_string(),
            font_family: "monospace".to_string(),
            font_size: 12,
            n_pixels: 0,
            signal_noise_ratio: 0.0,
            min_value: 0.0,
            max_value: 0.0,
            mean_value: 0.0,
            std_dev: 0.0,
            mad_value: 0.0,
            median_value: 0.0,
        }
    }
}

/// Color gradient stop for colorbar
#[derive(Debug, Clone)]
pub struct GradientStop {
    pub offset: f32,
    pub color: String,
}

impl GradientStop {
    pub fn new(offset: f32, color: String) -> Self {
        Self { offset, color }
    }
}

/// Colorbar label
#[derive(Debug, Clone)]
pub struct ColorbarLabel {
    pub y: f32,
    pub text: String,
}

impl ColorbarLabel {
    pub fn new(y: f32, text: String) -> Self {
        Self { y, text }
    }
}

/// Colorbar legend
#[derive(Debug, Clone)]
pub struct Colorbar {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub border_color: String,
    pub text_color: String,
    pub font_family: String,
    pub font_size: u32,
    pub title: String,
    pub gradient_stops: Vec<GradientStop>,
    pub labels: Vec<ColorbarLabel>,
}

impl Default for Colorbar {
    fn default() -> Self {
        Self {
            x: 3700,
            y: 400,
            width: 30,
            height: 1200,
            border_color: "#4a4a6a".to_string(),
            text_color: "#cccccc".to_string(),
            font_family: "monospace".to_string(),
            font_size: 12,
            title: "Brightness".to_string(),
            gradient_stops: Vec::new(),
            labels: Vec::new(),
        }
    }
}

/// Complete hemisphere template for SVG generation
#[derive(Debug, Clone)]
pub struct HemisphereTemplate {
    pub standalone: bool,
    pub width: i32,
    pub height: i32,
    pub view_width: i32,
    pub view_height: i32,
    pub title: Option<String>,
    pub description: Option<String>,

    // Styling
    pub background_color: String,
    pub polygon_stroke_width: u32,
    pub polygon_stroke_opacity: f32,

    // Grid styling
    pub show_grid: bool,
    pub grid_color: String,
    pub grid_line_width: u32,
    pub grid_dash_pattern: String,

    // Data
    pub pixels: Vec<HemispherePixel>,
    pub coords: Vec<String>, // Coordinate strings
    pub grid_circles: Vec<GridCircle>,
    pub grid_lines: Vec<GridLine>,
    pub sources: Option<Vec<SourceMarker>>,

    // Overlays
    pub show_stats: bool,
    pub stats: StatsOverlay,
    pub colorbar: Option<Colorbar>,

    // Custom content
    pub custom_content: String,
}

impl Default for HemisphereTemplate {
    fn default() -> Self {
        Self {
            standalone: true,
            width: 400,
            height: 400,
            view_width: 4000,
            view_height: 4000,
            title: None,
            description: None,
            background_color: "black".to_string(),
            polygon_stroke_width: 2,
            polygon_stroke_opacity: 1.0,
            show_grid: true,
            grid_color: "#00ff00".to_string(),
            grid_line_width: 2,
            grid_dash_pattern: "4 4".to_string(),
            pixels: Vec::new(),
            coords: Vec::new(),
            grid_circles: Vec::new(),
            grid_lines: Vec::new(),
            sources: None,
            show_stats: false,
            stats: StatsOverlay::default(),
            colorbar: Some(Colorbar::default()),
            custom_content: String::new(),
        }
    }
}

impl HemisphereTemplate {
    pub fn new(width: i32, height: i32, view_width: i32, view_height: i32) -> Self {
        Self {
            width,
            height,
            view_width,
            view_height,
            ..Default::default()
        }
    }

    pub fn with_title(mut self, title: &str) -> Self {
        self.title = Some(title.to_string());
        self
    }

    pub fn with_description(mut self, desc: &str) -> Self {
        self.description = Some(desc.to_string());
        self
    }

    pub fn with_background(mut self, color: &str) -> Self {
        self.background_color = color.to_string();
        self
    }

    pub fn show_grid(mut self, show: bool) -> Self {
        self.show_grid = show;
        self
    }

    pub fn with_grid_style(mut self, color: &str, width: u32, dash: &str) -> Self {
        self.grid_color = color.to_string();
        self.grid_line_width = width;
        self.grid_dash_pattern = dash.to_string();
        self
    }

    pub fn add_pixel(mut self, pixel: HemispherePixel) -> Self {
        self.pixels.push(pixel);
        self
    }

    pub fn add_grid_circle(mut self, circle: GridCircle) -> Self {
        self.grid_circles.push(circle);
        self
    }

    pub fn add_grid_line(mut self, line: GridLine) -> Self {
        self.grid_lines.push(line);
        self
    }

    pub fn with_sources(mut self, sources: Vec<SourceMarker>) -> Self {
        self.sources = Some(sources);
        self
    }

    pub fn show_stats(mut self, show: bool) -> Self {
        self.show_stats = show;
        self
    }

    pub fn with_stats(mut self, stats: StatsOverlay) -> Self {
        self.stats = stats;
        self
    }

    pub fn with_colorbar(mut self, colorbar: Colorbar) -> Self {
        self.colorbar = Some(colorbar);
        self
    }

    pub fn add_custom_content(mut self, content: &str) -> Self {
        self.custom_content = content.to_string();
        self
    }

    pub fn render_to_string(&self) -> Result<String, Box<dyn std::error::Error>> {
        Ok(self.to_svg_string())
    }

    /// Generate SVG string manually to match reference format exactly
    fn to_svg_string(&self) -> String {
        // Pre-allocate reusable formatters for fast integer/float formatting
        let mut i32_buf = itoa::Buffer::new();
        let mut u32_buf = itoa::Buffer::new();
        let mut f32_buf = ryu::Buffer::new();

        // Estimate SVG size for better memory allocation
        let estimated_size = 2048
            + (self.pixels.len() * 120)
            + (self.grid_circles.len() * 120)
            + (self.grid_lines.len() * 150)
            + (self.sources.as_ref().map_or(0, |s| s.len() * 120));
        let mut svg = String::with_capacity(estimated_size);

        // Build header using fast formatting
        svg.push_str(
            r#"<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg width="12cm" height="12cm" viewBox="0 0 "#,
        );
        svg.push_str(i32_buf.format(self.view_width));
        svg.push(' ');
        svg.push_str(i32_buf.format(self.view_height));
        svg.push_str(r#"" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
"#);

        // Description and title
        if let Some(ref desc) = self.description {
            svg.push_str("<desc>\"");
            svg.push_str(desc);
            svg.push_str("\"</desc>\n");
        }

        // Main group for pixels
        svg.push_str(r#"<g stroke-opacity=""#);
        svg.push_str(f32_buf.format(self.polygon_stroke_opacity));
        svg.push_str(r#"" stroke-linejoin="round" stroke-width=""#);
        svg.push_str(u32_buf.format(self.polygon_stroke_width));
        svg.push_str(
            r#"" >
"#,
        );

        // Render pixels using pre-computed coordinates and colors
        for pixel in &self.pixels {
            if let Some(coord_str) = self.coords.get(pixel.coord_index) {
                let (r, g, b) = pixel.get_color();
                svg.push_str("<polygon points=\"");
                svg.push_str(coord_str);
                svg.push_str(r#"" fill="rgb("#);
                svg.push_str(i32_buf.format(r as i32));
                svg.push(',');
                svg.push_str(i32_buf.format(g as i32));
                svg.push(',');
                svg.push_str(i32_buf.format(b as i32));
                svg.push_str(
                    r#")"/>
"#,
                );
            }
        }

        svg.push_str("</g>\n");

        // Render grid if enabled
        if self.show_grid {
            svg.push_str(r#"<g fill="none" stroke=""#);
            svg.push_str(&self.grid_color);
            svg.push_str(r#"" stroke-width=""#);
            svg.push_str(u32_buf.format(self.grid_line_width));
            svg.push_str(r#"" stroke-dasharray=""#);
            svg.push_str(&self.grid_dash_pattern);
            svg.push_str(
                r#"">
"#,
            );

            for circle in &self.grid_circles {
                svg.push_str("<circle cx=\"");
                svg.push_str(i32_buf.format(circle.cx));
                svg.push_str("\" cy=\"");
                svg.push_str(i32_buf.format(circle.cy));
                svg.push_str("\" r=\"");
                svg.push_str(u32_buf.format(circle.radius));
                svg.push_str(
                    r#""/>
"#,
                );
            }

            for line in &self.grid_lines {
                svg.push_str("<line x1=\"");
                svg.push_str(i32_buf.format(line.x1));
                svg.push_str("\" y1=\"");
                svg.push_str(i32_buf.format(line.y1));
                svg.push_str("\" x2=\"");
                svg.push_str(i32_buf.format(line.x2));
                svg.push_str("\" y2=\"");
                svg.push_str(i32_buf.format(line.y2));
                svg.push_str(
                    r#""/>
"#,
                );
            }

            svg.push_str("</g>\n");
        }

        // Render sources if any
        if let Some(ref sources) = self.sources {
            for source in sources {
                svg.push_str("<circle cx=\"");
                svg.push_str(i32_buf.format(source.x));
                svg.push_str("\" cy=\"");
                svg.push_str(i32_buf.format(source.y));
                svg.push_str("\" r=\"");
                svg.push_str(u32_buf.format(source.radius));
                svg.push_str(r#"" fill="none" stroke=""#);
                svg.push_str(&source.color);
                svg.push_str(r#"" stroke-width=""#);
                svg.push_str(u32_buf.format(source.stroke_width));
                svg.push_str(
                    r#""/>
"#,
                );
            }
        }

        // Render stats overlay if enabled
        if self.show_stats {
            let s = &self.stats;
            svg.push_str(r#"<g opacity=""#);
            svg.push_str(f32_buf.format(s.opacity));
            svg.push_str(
                r#"">
  <rect x=""#,
            );
            svg.push_str(i32_buf.format(s.x));
            svg.push_str(r#"" y=""#);
            svg.push_str(i32_buf.format(s.y));
            svg.push_str(r#"" width=""#);
            svg.push_str(i32_buf.format(s.width));
            svg.push_str(r#"" height=""#);
            svg.push_str(i32_buf.format(s.height));
            svg.push_str(r#"" fill=""#);
            svg.push_str(&s.background);
            svg.push_str(r#"" stroke=""#);
            svg.push_str(&s.border_color);
            svg.push_str(r#"" stroke-width=""#);
            svg.push_str(u32_buf.format(s.border_width));
            svg.push_str(
                r#"" rx="5"/>
  <text x=""#,
            );
            svg.push_str(i32_buf.format(s.x + 10));
            svg.push_str(r#"" y=""#);
            svg.push_str(i32_buf.format(s.y + 20));
            svg.push_str(r#"" fill=""#);
            svg.push_str(&s.text_color);
            svg.push_str(r#"" font-family=""#);
            svg.push_str(&s.font_family);
            svg.push_str(r#"" font-size=""#);
            svg.push_str(u32_buf.format(s.font_size));
            svg.push_str(r#"">N_pixels: "#);
            svg.push_str(i32_buf.format(s.n_pixels as i32));
            svg.push_str("</text>\n");

            svg.push_str(r#"  <text x=""#);
            svg.push_str(i32_buf.format(s.x + 10));
            svg.push_str(r#"" y=""#);
            svg.push_str(i32_buf.format(s.y + 36));
            svg.push_str(r#"" fill=""#);
            svg.push_str(&s.text_color);
            svg.push_str(r#"" font-family=""#);
            svg.push_str(&s.font_family);
            svg.push_str(r#"" font-size=""#);
            svg.push_str(u32_buf.format(s.font_size));
            svg.push_str(r#"">S/N: "#);
            svg.push_str(f32_buf.format(s.signal_noise_ratio));
            svg.push_str("</text>\n");

            svg.push_str(r#"  <text x=""#);
            svg.push_str(i32_buf.format(s.x + 10));
            svg.push_str(r#"" y=""#);
            svg.push_str(i32_buf.format(s.y + 52));
            svg.push_str(r#"" fill=""#);
            svg.push_str(&s.text_color);
            svg.push_str(r#"" font-family=""#);
            svg.push_str(&s.font_family);
            svg.push_str(r#"" font-size=""#);
            svg.push_str(u32_buf.format(s.font_size));
            svg.push_str(r#"">Min/Max/Sdev: "#);
            svg.push_str(f32_buf.format(s.min_value));
            svg.push('/');
            svg.push_str(f32_buf.format(s.max_value));
            svg.push('/');
            svg.push_str(f32_buf.format(s.std_dev));
            svg.push_str("</text>\n");

            svg.push_str("</g>\n");
        }

        // Render colorbar if present
        if let Some(ref colorbar) = self.colorbar {
            svg.push_str(
                r#"<g>
  <defs>
    <linearGradient id="cubehelixGradient" x1="0" y1="1" x2="0" y2="0">
"#,
            );
            for stop in &colorbar.gradient_stops {
                svg.push_str(r##"      <stop offset=""##);
                svg.push_str(f32_buf.format(stop.offset));
                svg.push_str(r#"" stop-color=""#);
                svg.push_str(&stop.color);
                svg.push_str(
                    r#""/>
"#,
                );
            }
            svg.push_str(
                r##"    </linearGradient>
  </defs>
  <rect x=""##,
            );
            svg.push_str(i32_buf.format(colorbar.x));
            svg.push_str(r#"" y=""#);
            svg.push_str(i32_buf.format(colorbar.y));
            svg.push_str(r#"" width=""#);
            svg.push_str(i32_buf.format(colorbar.width));
            svg.push_str(r#"" height=""#);
            svg.push_str(i32_buf.format(colorbar.height));
            svg.push_str(r#"" fill="url(#cubehelixGradient)" stroke=""#);
            svg.push_str(&colorbar.border_color);
            svg.push_str(
                r#"" stroke-width="1"/>
"#,
            );

            // Labels
            for label in &colorbar.labels {
                svg.push_str(r#"<text x=""#);
                svg.push_str(i32_buf.format(colorbar.x + colorbar.width + 5));
                svg.push_str(r#"" y=""#);
                svg.push_str(f32_buf.format(label.y));
                svg.push_str(r#"" fill=""#);
                svg.push_str(&colorbar.text_color);
                svg.push_str(r#"" font-family=""#);
                svg.push_str(&colorbar.font_family);
                svg.push_str(r#"" font-size=""#);
                svg.push_str(u32_buf.format(colorbar.font_size));
                svg.push_str(r#"" dominant-baseline="middle">"#);
                svg.push_str(&label.text);
                svg.push_str("</text>\n");
            }

            // Title
            svg.push_str(r#"<text x=""#);
            svg.push_str(i32_buf.format(colorbar.width / 2));
            svg.push_str(r#"" y="-10" fill=""#);
            svg.push_str(&colorbar.text_color);
            svg.push_str(r#"" font-family=""#);
            svg.push_str(&colorbar.font_family);
            svg.push_str(r#"" font-size=""#);
            svg.push_str(u32_buf.format(colorbar.font_size));
            svg.push_str(r#"" text-anchor="middle">"#);
            svg.push_str(&colorbar.title);
            svg.push_str("</text>\n");

            svg.push_str("</g>\n");
        }

        svg.push_str("</svg>\n");
        svg
    }

    pub fn save_to_file<P: AsRef<std::path::Path>>(
        &self,
        path: P,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let content = self.render_to_string()?;
        std::fs::write(path, content)?;
        Ok(())
    }
}

/// Builder pattern for constructing HemisphereTemplate with sensible defaults
pub struct HemisphereBuilder {
    pub template: HemisphereTemplate,
}

impl Default for HemisphereBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl HemisphereBuilder {
    pub fn new() -> Self {
        Self {
            template: HemisphereTemplate::default(),
        }
    }

    pub fn from_template(template: HemisphereTemplate) -> Self {
        Self { template }
    }

    pub fn title(mut self, title: &str) -> Self {
        self.template = self.template.with_title(title);
        self
    }

    pub fn description(mut self, desc: &str) -> Self {
        self.template = self.template.with_description(desc);
        self
    }

    pub fn astronomy_theme(mut self) -> Self {
        self.template.background_color = "#0a0a1a".to_string();
        self.template.grid_color = "#1a3a1a".to_string();
        self.template.grid_line_width = 1;
        self.template.grid_dash_pattern = "4 4".to_string();
        self.template.polygon_stroke_width = 1;
        self.template.polygon_stroke_opacity = 1.0;
        self
    }

    pub fn light_theme(mut self) -> Self {
        self.template.background_color = "#ffffff".to_string();
        self.template.grid_color = "#cccccc".to_string();
        self.template.grid_line_width = 1;
        self.template.grid_dash_pattern = "4 4".to_string();
        self.template.polygon_stroke_width = 1;
        self.template.polygon_stroke_opacity = 1.0;
        self
    }

    /// Add elevation circles at standard elevations
    pub fn add_elevation_circles(mut self, center_x: i32, center_y: i32, _line_size: u32) -> Self {
        let elevations: [f32; 4] = [30.0, 45.0, 60.0, 75.0];
        for &el_deg in &elevations {
            let el = el_deg.to_radians();
            let r = el.sin() * (self.template.view_width as f32) / 2.1;
            self.template
                .grid_circles
                .push(GridCircle::new(center_x, center_y, r.round() as u32));
        }
        self
    }

    /// Add azimuth lines at standard angles
    pub fn add_azimuth_lines(mut self, center_x: i32, center_y: i32) -> Self {
        let half_width = (self.template.view_width as f32) / 2.0;
        let angles: [f32; 8] = [0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0];
        for &az_deg in &angles {
            let az = az_deg.to_radians();
            let (sin_a, cos_a) = az.sin_cos();
            let x1 = center_x as f32 - half_width * sin_a;
            let y1 = center_y as f32 - half_width * cos_a;
            let x2 = center_x as f32 + half_width * sin_a;
            let y2 = center_y as f32 + half_width * cos_a;
            self.template.grid_lines.push(GridLine::new(
                x1.round() as i32,
                y1.round() as i32,
                x2.round() as i32,
                y2.round() as i32,
            ));
        }
        self
    }

    pub fn add_pixel(mut self, pixel: HemispherePixel) -> Self {
        self.template.pixels.push(pixel);
        self
    }

    pub fn with_coords(mut self, coords: Vec<String>) -> Self {
        self.template.coords = coords;
        self
    }

    pub fn show_stats(mut self, show: bool) -> Self {
        self.template.show_stats = show;
        self
    }

    pub fn show_grid(mut self, show: bool) -> Self {
        self.template.show_grid = show;
        self
    }

    pub fn with_sources(mut self, sources: Vec<SourceMarker>) -> Self {
        self.template.sources = Some(sources);
        self
    }

    pub fn with_hemisphere_stats(
        mut self,
        npix: usize,
        min_p: f32,
        max_p: f32,
        mean_p: f32,
        sdev_p: f32,
        mad_p: f32,
        med: f32,
    ) -> Self {
        let snr = if sdev_p > 0.0 { max_p / sdev_p } else { 0.0 };
        self.template.stats = StatsOverlay {
            n_pixels: npix,
            signal_noise_ratio: snr,
            min_value: min_p,
            max_value: max_p,
            mean_value: mean_p,
            std_dev: sdev_p,
            mad_value: mad_p,
            median_value: med,
            ..Default::default()
        };
        self
    }

    /// Add a cubehelix colorbar to the template
    pub fn add_cubehelix_colorbar(mut self, min_val: f32, max_val: f32) -> Self {
        let mut colorbar = Colorbar::default();

        // Generate gradient stops using the cubehelix LUT
        let steps = 20;
        for i in 0..=steps {
            let fract = i as f32 / steps as f32;
            let (r, g, b) = cmap(fract.clamp(0.0, 1.0));
            let color = format!("#{:02x}{:02x}{:02x}", r, g, b);
            let offset = (steps - i) as f32 / steps as f32; // Reversed: top is bright
            colorbar
                .gradient_stops
                .push(GradientStop::new(offset, color));
        }

        // Add value labels
        let label_count = 5;
        for i in 0..=label_count {
            let fract = i as f32 / label_count as f32;
            let value = min_val + (max_val - min_val) * (1.0 - fract);
            let y = colorbar.y as f32 + fract * colorbar.height as f32;
            colorbar
                .labels
                .push(ColorbarLabel::new(y, format!("{:.4}", value)));
        }

        self.template.colorbar = Some(colorbar);
        self
    }

    pub fn build(self) -> HemisphereTemplate {
        self.template
    }

    pub fn render(self) -> Result<String, Box<dyn std::error::Error>> {
        self.template.render_to_string()
    }
}

/// Pre-computed cubehelix color lookup table for the template rendering path.
///
/// This avoids computing sin_cos per pixel during SVG generation.
static CUBEHELIX_LUT: once_cell::sync::Lazy<[(u8, u8, u8); 256]> =
    once_cell::sync::Lazy::new(|| {
        let mut lut = [(0u8, 0u8, 0u8); 256];
        for (i, entry) in lut.iter_mut().enumerate() {
            *entry = cmap_raw(i as f32 / 255.0);
        }
        lut
    });

/// Raw cubehelix computation (used only to build the LUT).
fn cmap_raw(fract: f32) -> (u8, u8, u8) {
    use num::clamp;

    const START: f32 = 1.0;
    const ROT: f32 = -1.5;
    const SAT: f32 = 1.5;

    let angle_base = TWO_PI * (START / 3.0 + 1.0);
    let angle_scale = TWO_PI * ROT;

    let angle = angle_base + angle_scale * fract;
    let (sin_angle, cos_angle) = angle.sin_cos();

    let amp = SAT * fract * (1.0 - fract) * 0.5;
    let amp_cos = amp * cos_angle;
    let amp_sin = amp * sin_angle;

    let red = clamp(fract + amp_cos * -0.14861 + amp_sin * 1.78277, 0.0, 1.0);
    let grn = clamp(fract + amp_cos * -0.29227 + amp_sin * -0.90649, 0.0, 1.0);
    let blu = clamp(fract + amp_cos * 1.97294, 0.0, 1.0);

    (
        (red * 255.0).round() as u8,
        (grn * 255.0).round() as u8,
        (blu * 255.0).round() as u8,
    )
}

/// Generate cubehelix color mapping (LUT-accelerated).
///
/// For 8-bit output, the LUT provides identical colors to the original
/// per-pixel computation at ~5-10× the speed.
pub fn cmap(fract: f32) -> (u8, u8, u8) {
    let idx = ((fract.clamp(0.0, 1.0)) * 255.0) as usize;
    CUBEHELIX_LUT[idx]
}

impl std::fmt::Display for HemisphereTemplate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.to_svg_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hemisphere_template_basic() {
        let template = HemisphereTemplate::new(100, 100, 400, 400).with_title("Test");
        assert_eq!(template.width, 100);
        assert_eq!(template.height, 100);
    }
}
