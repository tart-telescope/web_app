//! Hemisphere template implementation for gridless imaging visualization
//!
//! This module provides template-based SVG generation for astronomy hemisphere plots,
//! replacing the direct SVG library usage with Sailfish templates for better
//! maintainability and performance.

use serde::{Deserialize, Serialize};

use super::{SvgTemplate, TemplateContext, TemplateResult};
use crate::utils::TWO_PI;

/// A pixel in the hemisphere plot
#[derive(Debug, Clone, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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

    pub fn with_color<S: Into<String>>(mut self, color: S) -> Self {
        self.color = color.into();
        self
    }

    pub fn with_stroke_width(mut self, width: u32) -> Self {
        self.stroke_width = width;
        self
    }
}

/// Statistics overlay data
#[derive(Debug, Clone, Serialize, Deserialize)]
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

    // Statistical values
    pub n_pixels: usize,
    pub signal_noise_ratio: String,
    pub min_value: String,
    pub max_value: String,
    pub mean_value: String,
    pub std_dev: String,
    pub mad_value: String,
    pub median_value: String,
}

impl Default for StatsOverlay {
    fn default() -> Self {
        Self {
            x: 50,
            y: 50,
            width: 200,
            height: 140,
            background: "rgba(0, 0, 0, 0.8)".to_string(),
            border_color: "#666666".to_string(),
            border_width: 1,
            opacity: 0.9,
            text_color: "#ffffff".to_string(),
            font_family: "monospace".to_string(),
            font_size: 12,
            n_pixels: 0,
            signal_noise_ratio: "0.0".to_string(),
            min_value: "0.0".to_string(),
            max_value: "0.0".to_string(),
            mean_value: "0.0".to_string(),
            std_dev: "0.0".to_string(),
            mad_value: "0.0".to_string(),
            median_value: "0.0".to_string(),
        }
    }
}

/// Color gradient stop for colorbar
#[derive(Debug, Clone, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
            x: 100,
            y: 100,
            width: 20,
            height: 200,
            border_color: "#333333".to_string(),
            text_color: "#ffffff".to_string(),
            font_family: "Arial, sans-serif".to_string(),
            font_size: 12,
            title: "Intensity".to_string(),
            gradient_stops: Vec::new(),
            labels: Vec::new(),
        }
    }
}

/// Hemisphere plot template data structure
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
            standalone: false, // Match reference format
            width: 12,
            height: 12,
            view_width: 4000,
            view_height: 4000,
            title: None,
            description: Some("Gridless imaging from visibilities.".to_string()),
            background_color: "#000000".to_string(),
            polygon_stroke_width: 2,
            polygon_stroke_opacity: 1.0,
            show_grid: true,
            grid_color: "white".to_string(),
            grid_line_width: 10,                     // Match reference format
            grid_dash_pattern: "50,100".to_string(), // Match reference format
            pixels: Vec::new(),
            coords: Vec::new(),
            grid_circles: Vec::new(),
            grid_lines: Vec::new(),
            sources: None,
            show_stats: false,
            stats: StatsOverlay::default(),
            colorbar: None,
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

    pub fn with_title<S: Into<String>>(mut self, title: S) -> Self {
        self.title = Some(title.into());
        self
    }

    pub fn with_description<S: Into<String>>(mut self, desc: S) -> Self {
        self.description = Some(desc.into());
        self
    }

    pub fn with_background<S: Into<String>>(mut self, color: S) -> Self {
        self.background_color = color.into();
        self
    }

    pub fn show_grid(mut self, show: bool) -> Self {
        self.show_grid = show;
        self
    }

    pub fn with_grid_style<S: Into<String>>(mut self, color: S, width: u32, dash: S) -> Self {
        self.grid_color = color.into();
        self.grid_line_width = width;
        self.grid_dash_pattern = dash.into();
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

    pub fn add_custom_content<S: Into<String>>(mut self, content: S) -> Self {
        self.custom_content.push_str(&content.into());
        self
    }

    pub fn render_to_string(&self) -> TemplateResult<String> {
        // Generate SVG string with all features including colorbar and stats
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
<svg width=""#,
        );
        svg.push_str(i32_buf.format(self.width));
        svg.push_str(r#"cm" height=""#);
        svg.push_str(i32_buf.format(self.height));
        svg.push_str(r#"cm" viewBox="0 0 "#);
        svg.push_str(i32_buf.format(self.view_width));
        svg.push(' ');
        svg.push_str(i32_buf.format(self.view_height));
        svg.push_str(r#"" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
"#);

        if let Some(ref desc) = self.description {
            svg.push_str("<desc>\"");
            svg.push_str(desc);
            svg.push_str("\"</desc>\n");
        }

        // Add pixel group with fast formatting
        svg.push_str(r#"<g stroke-opacity=""#);
        svg.push_str(f32_buf.format(self.polygon_stroke_opacity));
        svg.push_str(r#"" stroke-linejoin="round" stroke-width=""#);
        svg.push_str(u32_buf.format(self.polygon_stroke_width));
        svg.push_str(
            r#"" >
"#,
        );

        for pixel in &self.pixels {
            // Apply color mapping during rendering
            let color_string = pixel.get_color_string();
            let coord_string = &self.coords[pixel.coord_index];

            svg.push_str(r#"<polygon points=""#);
            svg.push_str(coord_string);
            svg.push_str(r#"" fill=""#);
            svg.push_str(&color_string);
            svg.push_str(r#"" stroke=""#);
            svg.push_str(&color_string);
            svg.push_str(
                r#"" />
"#,
            );
        }

        svg.push_str("</g>\n");

        // Add grid if enabled with fast formatting
        if self.show_grid {
            for circle in &self.grid_circles {
                svg.push_str(r#"<circle cx=""#);
                svg.push_str(i32_buf.format(circle.cx));
                svg.push_str(r#"" cy=""#);
                svg.push_str(i32_buf.format(circle.cy));
                svg.push_str(r#"" r=""#);
                svg.push_str(u32_buf.format(circle.radius));
                svg.push_str(r#"" stroke-linejoin="round" stroke=""#);
                svg.push_str(&self.grid_color);
                svg.push_str(r#"" stroke-dasharray=""#);
                svg.push_str(&self.grid_dash_pattern);
                svg.push_str(r#"" stroke-width=""#);
                svg.push_str(u32_buf.format(self.grid_line_width));
                svg.push_str(
                    r#"" fill="none" />
"#,
                );
            }

            for line in &self.grid_lines {
                svg.push_str(r#"<line x1=""#);
                svg.push_str(i32_buf.format(line.x1));
                svg.push_str(r#"" y1=""#);
                svg.push_str(i32_buf.format(line.y1));
                svg.push_str(r#"" x2=""#);
                svg.push_str(i32_buf.format(line.x2));
                svg.push_str(r#"" y2=""#);
                svg.push_str(i32_buf.format(line.y2));
                svg.push_str(r#"" stroke=""#);
                svg.push_str(&self.grid_color);
                svg.push_str(r#"" stroke-width=""#);
                svg.push_str(u32_buf.format(self.grid_line_width));
                svg.push_str(r#"" stroke-dasharray=""#);
                svg.push_str(&self.grid_dash_pattern);
                svg.push_str(
                    r#"" stroke-linejoin="round" fill="none" />
"#,
                );
            }
        }

        // Add sources if any with fast formatting
        if let Some(ref sources) = self.sources {
            for source in sources {
                svg.push_str(r#"<circle cx=""#);
                svg.push_str(i32_buf.format(source.x));
                svg.push_str(r#"" cy=""#);
                svg.push_str(i32_buf.format(source.y));
                svg.push_str(r#"" r=""#);
                svg.push_str(u32_buf.format(source.radius));
                svg.push_str(r#"" fill="none" stroke=""#);
                svg.push_str(&source.color);
                svg.push_str(r#"" stroke-width=""#);
                svg.push_str(u32_buf.format(source.stroke_width));
                svg.push_str(r#"" el=""#);
                svg.push_str(f32_buf.format(source.elevation));
                svg.push_str(r#"" az=""#);
                svg.push_str(f32_buf.format(source.azimuth));
                svg.push_str(r#"" name=""#);
                svg.push_str(&source.name);
                svg.push_str("\"/>\n");
            }
        }

        // Add statistics overlay if enabled
        if self.show_stats {
            svg.push_str(r#"<g id="statistics" transform="translate("#);
            svg.push_str(i32_buf.format(self.stats.x));
            svg.push(',');
            svg.push_str(i32_buf.format(self.stats.y));
            svg.push_str(
                r#")">
"#,
            );

            svg.push_str(r#"<rect width=""#);
            svg.push_str(i32_buf.format(self.stats.width));
            svg.push_str(r#"" height=""#);
            svg.push_str(i32_buf.format(self.stats.height));
            svg.push_str(r#"" fill=""#);
            svg.push_str(&self.stats.background);
            svg.push_str(r#"" stroke=""#);
            svg.push_str(&self.stats.border_color);
            svg.push_str(r#"" stroke-width=""#);
            svg.push_str(u32_buf.format(self.stats.border_width));
            svg.push_str(r#"" opacity=""#);
            svg.push_str(f32_buf.format(self.stats.opacity));
            svg.push_str(
                r#"" rx="5"/>
"#,
            );

            svg.push_str(r#"<text x="10" y="20" fill=""#);
            svg.push_str(&self.stats.text_color);
            svg.push_str(r#"" font-family=""#);
            svg.push_str(&self.stats.font_family);
            svg.push_str(r#"" font-size=""#);
            svg.push_str(u32_buf.format(self.stats.font_size));
            svg.push_str(
                r#"">
"#,
            );

            svg.push_str(r#"<tspan x="10" dy="0">Pixels: "#);
            svg.push_str(u32_buf.format(self.stats.n_pixels));
            svg.push_str("</tspan>\n");

            svg.push_str(r#"<tspan x="10" dy="15">S/N: "#);
            svg.push_str(&self.stats.signal_noise_ratio);
            svg.push_str("</tspan>\n");

            svg.push_str(r#"<tspan x="10" dy="15">Min: "#);
            svg.push_str(&self.stats.min_value);
            svg.push_str("</tspan>\n");

            svg.push_str(r#"<tspan x="10" dy="15">Max: "#);
            svg.push_str(&self.stats.max_value);
            svg.push_str("</tspan>\n");

            svg.push_str(r#"<tspan x="10" dy="15">Mean: "#);
            svg.push_str(&self.stats.mean_value);
            svg.push_str("</tspan>\n");

            svg.push_str(r#"<tspan x="10" dy="15">StdDev: "#);
            svg.push_str(&self.stats.std_dev);
            svg.push_str("</tspan>\n");

            svg.push_str(r#"<tspan x="10" dy="15">MAD: "#);
            svg.push_str(&self.stats.mad_value);
            svg.push_str("</tspan>\n");

            svg.push_str(r#"<tspan x="10" dy="15">Median: "#);
            svg.push_str(&self.stats.median_value);
            svg.push_str("</tspan>\n");

            svg.push_str("</text>\n</g>\n");
        }

        // Add colorbar if enabled
        if let Some(ref colorbar) = self.colorbar {
            svg.push_str(r#"<g id="colorbar" transform="translate("#);
            svg.push_str(i32_buf.format(colorbar.x));
            svg.push(',');
            svg.push_str(i32_buf.format(colorbar.y));
            svg.push_str(
                r#")">
"#,
            );

            // Color gradient definition
            svg.push_str(
                r#"<defs>
<linearGradient id="colorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
"#,
            );

            for stop in &colorbar.gradient_stops {
                svg.push_str(r#"<stop offset=""#);
                svg.push_str(f32_buf.format(stop.offset));
                svg.push_str(r#"%" stop-color=""#);
                svg.push_str(&stop.color);
                svg.push_str("\"/>\n");
            }

            svg.push_str("</linearGradient>\n</defs>\n");

            // Color bar rectangle
            svg.push_str(r#"<rect width=""#);
            svg.push_str(i32_buf.format(colorbar.width));
            svg.push_str(r#"" height=""#);
            svg.push_str(i32_buf.format(colorbar.height));
            svg.push_str(r#"" fill="url(#colorGradient)" stroke=""#);
            svg.push_str(&colorbar.border_color);
            svg.push_str(
                r#"" stroke-width="1"/>
"#,
            );

            // Scale labels
            for label in &colorbar.labels {
                svg.push_str(r#"<text x=""#);
                svg.push_str(i32_buf.format(colorbar.width + 5));
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

    pub fn save_to_file<P: AsRef<std::path::Path>>(&self, path: P) -> TemplateResult<()> {
        let content = self.render_to_string()?;
        std::fs::write(path, content)?;
        Ok(())
    }
}

impl SvgTemplate for HemisphereTemplate {
    type Context = TemplateContext;

    fn render(&self, _context: &Self::Context) -> Result<String, sailfish::RenderError> {
        Ok(self.to_svg_string())
    }

    fn template_name(&self) -> &'static str {
        "hemisphere_plot"
    }
}

/// Builder for creating hemisphere plots with data from the Hemisphere struct
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

    pub fn title<S: Into<String>>(mut self, title: S) -> Self {
        self.template = self.template.with_title(title);
        self
    }

    pub fn description<S: Into<String>>(mut self, desc: S) -> Self {
        self.template = self.template.with_description(desc);
        self
    }

    pub fn astronomy_theme(mut self) -> Self {
        self.template = self
            .template
            .with_background("#000011")
            .with_grid_style("white", 1, "50,100");
        self
    }

    pub fn light_theme(mut self) -> Self {
        self.template = self
            .template
            .with_background("#ffffff")
            .with_grid_style("#cccccc", 1, "2,4");
        self
    }

    /// Add elevation circles for the grid
    pub fn add_elevation_circles(mut self, center_x: i32, center_y: i32, line_size: u32) -> Self {
        for angle in &[10, 30, 60, 90] {
            let rad = (*angle as f32).to_radians();
            let scale = (self.template.view_width as f32) / 2.1;
            let radius = (rad.sin() * scale).round() as u32;

            let circle = GridCircle::new(center_x, center_y, radius);
            self.template = self.template.add_grid_circle(circle);
        }

        // Update grid line width to match reference format
        self.template.grid_line_width = line_size;

        self
    }

    /// Add azimuth lines for the grid
    pub fn add_azimuth_lines(mut self, center_x: i32, center_y: i32) -> Self {
        let scale = (self.template.view_width as f32) / 2.1;
        let rad0 = 10_f32.to_radians();
        let radius0 = rad0.sin();

        for angle in (0..360).step_by(30) {
            let rad = (angle as f32).to_radians();
            let x = rad.sin();
            let y = rad.cos();
            let x0 = radius0 * x;
            let y0 = radius0 * y;

            let x1 = (x0 * scale).round() as i32 + center_x;
            let y1 = (y0 * scale).round() as i32 + center_y;
            let x2 = (x * scale).round() as i32 + center_x;
            let y2 = (y * scale).round() as i32 + center_y;

            let line = GridLine::new(x1, y1, x2, y2);
            self.template = self.template.add_grid_line(line);
        }

        self
    }

    /// Add a pixel to the hemisphere plot
    pub fn add_pixel(mut self, pixel: HemispherePixel) -> Self {
        self.template = self.template.add_pixel(pixel);
        self
    }

    /// Set coordinate strings
    pub fn with_coords(mut self, coords: Vec<String>) -> Self {
        self.template.coords = coords;
        self
    }

    /// Show or hide statistics overlay
    pub fn show_stats(mut self, show: bool) -> Self {
        self.template.show_stats = show;
        self
    }

    /// Show or hide the grid
    pub fn show_grid(mut self, show: bool) -> Self {
        self.template = self.template.show_grid(show);
        self
    }

    /// Add sources to the plot
    pub fn with_sources(mut self, sources: Vec<SourceMarker>) -> Self {
        self.template = self.template.with_sources(sources);
        self
    }

    /// Add statistics from hemisphere analysis
    pub fn with_hemisphere_stats(
        mut self,
        n_pixels: usize,
        min_p: f32,
        max_p: f32,
        mean_p: f32,
        sdev_p: f32,
        mad_p: f32,
        med_p: f32,
    ) -> Self {
        let mut stats = StatsOverlay::default();
        stats.n_pixels = n_pixels;

        // Use fast ryu formatting for floating point values
        let mut buf = ryu::Buffer::new();
        stats.signal_noise_ratio = buf.format(max_p / sdev_p).to_string();
        stats.min_value = buf.format(min_p).to_string();
        stats.max_value = buf.format(max_p).to_string();
        stats.mean_value = buf.format(mean_p).to_string();
        stats.std_dev = buf.format(sdev_p).to_string();
        stats.mad_value = buf.format(mad_p).to_string();
        stats.median_value = buf.format(med_p).to_string();

        self.template = self.template.with_stats(stats);
        self
    }

    /// Add colorbar with cubehelix color mapping
    pub fn add_cubehelix_colorbar(mut self, min_val: f32, max_val: f32) -> Self {
        let mut colorbar = Colorbar::default();

        // Set colorbar to 3% of width and 90% of height
        colorbar.width = (self.template.view_width as f32 * 0.03) as i32;
        colorbar.height = (self.template.view_height as f32 * 0.90) as i32;

        // Position colorbar on the right side with some margin
        colorbar.x = self.template.view_width - colorbar.width - 50;
        colorbar.y = (self.template.view_height as f32 * 0.05) as i32; // 5% margin from top
        colorbar.title = "Intensity".to_string();

        // Pre-allocate formatters for fast string generation
        let mut r_buf = itoa::Buffer::new();
        let mut g_buf = itoa::Buffer::new();
        let mut b_buf = itoa::Buffer::new();
        let mut value_buf = ryu::Buffer::new();

        // Generate cubehelix gradient stops with fast formatting
        for i in 0..=10 {
            let fract = i as f32 / 10.0;
            let (r, g, b) = cmap(fract);

            // Fast RGB color string generation
            let mut color = String::with_capacity(16);
            color.push_str("rgb(");
            color.push_str(r_buf.format(r));
            color.push(',');
            color.push_str(g_buf.format(g));
            color.push(',');
            color.push_str(b_buf.format(b));
            color.push(')');

            colorbar
                .gradient_stops
                .push(GradientStop::new(fract * 100.0, color));
        }

        // Add value labels with fast formatting
        for i in 0..=5 {
            let fract = i as f32 / 5.0;
            let value = min_val + fract * (max_val - min_val);
            let y = colorbar.height as f32 * (1.0 - fract);

            // Fast scientific notation formatting
            let value_str = value_buf.format(value);
            colorbar
                .labels
                .push(ColorbarLabel::new(y, value_str.to_string()));
        }

        self.template = self.template.with_colorbar(colorbar);
        self
    }

    pub fn build(self) -> HemisphereTemplate {
        self.template
    }

    pub fn render(self) -> TemplateResult<String> {
        self.build().render_to_string()
    }
}

/// Generate cubehelix color mapping (optimized version)
pub fn cmap(fract: f32) -> (u8, u8, u8) {
    use num::clamp;

    // CubeHelix parameters
    const START: f32 = 1.0;
    const ROT: f32 = -1.5;
    const SAT: f32 = 1.5;

    // Pre-computed constants for optimized calculation
    // angle = TWO_PI * (START / 3.0 + ROT * fract + 1.0)
    // angle = TWO_PI * (1.0/3.0 + 1.0 + ROT * fract)
    // angle = TWO_PI * (4.0/3.0 + ROT * fract)
    let angle_base = TWO_PI * (START / 3.0 + 1.0); // TWO_PI * (4.0/3.0)
    let angle_scale = TWO_PI * ROT; // TWO_PI * (-1.5)

    let angle = angle_base + angle_scale * fract;
    let (sin_angle, cos_angle) = angle.sin_cos(); // Single call for both sin and cos

    // Optimized amplitude calculation
    let amp = SAT * fract * (1.0 - fract) * 0.5;

    // Pre-compute products to reduce multiplications
    let amp_cos = amp * cos_angle;
    let amp_sin = amp * sin_angle;

    // Compute RGB vectors with fewer operations (original coefficients)
    let red = clamp(fract + amp_cos * -0.14861 + amp_sin * 1.78277, 0.0, 1.0);
    let grn = clamp(fract + amp_cos * -0.29227 + amp_sin * -0.90649, 0.0, 1.0);
    let blu = clamp(fract + amp_cos * 1.97294, 0.0, 1.0);

    // Convert to integer RGB
    (
        (red * 255.0).round() as u8,
        (grn * 255.0).round() as u8,
        (blu * 255.0).round() as u8,
    )
}

impl std::fmt::Display for HemisphereTemplate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_svg_string())
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
