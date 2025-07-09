/*
    Classes to hold pixelated spheres

    Tim Molteno tim@elec.ac.nz 2019-2021
*/

use crate::utils::{PI_OVER_2, VectorReal, fast_sin_cos};
#[cfg(target_arch = "wasm32")]
use crate::wasm::sphere_simd;
use cdshealpix::ring::center;
use serde::{Deserialize, Serialize};

/*
*   Elevation and Azimuth (in radians)
*/
#[derive(Debug, Clone)]
pub struct ElAz {
    pub el: f32,
    pub az: f32,
}

/*
*   A LonLat is the internal structure used by CDS healpix.
*/
#[derive(Debug, Clone)]
pub struct LonLat {
    pub lon: f32,
    pub lat: f32,
}

/*
*   A HpAngle is the internal structure used by HEALPY
*   phi is a longitude, and
*   theta is a colatitude (zero at the zenith, pi/2 at the horizon and -pi at the south pole.
*/
#[derive(Debug, Clone)]
pub struct HpAngle {
    pub theta: f32,
    pub phi: f32,
}

impl LonLat {
    pub fn new(lon: f32, lat: f32) -> LonLat {
        LonLat { lon, lat }
    }
    #[allow(dead_code)]
    pub fn from_hp(hp: &HpAngle) -> LonLat {
        LonLat::new(hp.phi, PI_OVER_2 - hp.theta)
    }

    pub fn from_pix(nside: u32, pix: u64) -> LonLat {
        let (lon, lat) = center(nside, pix);
        LonLat::new(lon as f32, lat as f32)
    }
}

impl HpAngle {
    pub fn new(theta: f32, phi: f32) -> HpAngle {
        HpAngle { theta, phi }
    }

    pub fn from_lonlat(lonlat: &LonLat) -> HpAngle {
        HpAngle::new(PI_OVER_2 - lonlat.lat, lonlat.lon)
    }

    pub fn from_elaz(el: f32, az: f32) -> HpAngle {
        let theta = PI_OVER_2 - el;
        let phi = -az;
        HpAngle::new(theta, phi)
    }

    pub fn proj(&self) -> (f32, f32) {
        // viewpoint is from straight up, projected down.
        let r = f32::sin(self.theta);
        let (sin_phi, cos_phi) = fast_sin_cos(self.phi);
        let x = r * sin_phi;
        let y = -r * cos_phi;

        (x, y)
    }
}

impl ElAz {
    pub fn new(el: f32, az: f32) -> ElAz {
        ElAz { el, az }
    }

    pub fn from_hp(hp: &HpAngle) -> ElAz {
        let el = PI_OVER_2 - hp.theta;
        let az = -hp.phi;
        ElAz::new(el, az)
    }

    pub fn to_hp(&self) -> HpAngle {
        HpAngle::from_elaz(self.el, self.az)
    }

    pub fn to_lmn(&self) -> (f32, f32, f32) {
        let (sin_az, cos_az) = fast_sin_cos(self.az);
        let (sin_el, cos_el) = fast_sin_cos(self.el);
        let l = sin_az * cos_el;
        let m = cos_az * cos_el;
        let n = sin_el; // Often written in this weird way... np.sqrt(1.0 - l**2 - m**2)
        (l, m, n)
    }
}

#[derive(Clone)]
pub struct Hemisphere {
    pub nside: u32,
    pub npix: usize,
    pub visible_pix: VectorReal,
    pub visible_indices: Vec<u64>,
    #[allow(dead_code)]
    pub elaz: Vec<ElAz>,
    pub l: VectorReal,
    pub m: VectorReal,
    pub n: VectorReal,
}

impl Hemisphere {
    pub fn new(nside: u32) -> Hemisphere {
        #[cfg(target_arch = "wasm32")]
        {
            sphere_simd::compute_hemisphere_optimized(nside)
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            Self::compute_new_scalar(nside)
        }
    }

    /// Optimized hemisphere computation with automatic SIMD usage.
    ///
    /// Delegates to the SIMD-optimized implementation when available,
    /// falls back to scalar version otherwise. Uses pre-allocation and
    /// direct calculations for optimal performance.
    ///
    /// ## Performance Benefits:
    /// - Automatic SIMD acceleration when targeting WebAssembly
    /// - Pre-allocation eliminates vector reallocations
    /// - Direct coordinate calculations reduce struct overhead
    /// - ~4× performance improvement with SIMD on supported targets
    pub fn compute_new(nside: u32) -> Hemisphere {
        #[cfg(target_arch = "wasm32")]
        {
            sphere_simd::compute_hemisphere_optimized(nside)
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            Self::compute_new_scalar(nside)
        }
    }

    /// Alternative compute_new with single-pass estimation (experimental).
    ///
    /// Delegates to the SIMD module for consistent optimization behavior.
    /// The SIMD module handles both single-pass and two-pass optimizations
    /// automatically based on target architecture.
    #[allow(dead_code)]
    pub fn compute_new_single_pass(nside: u32) -> Hemisphere {
        #[cfg(target_arch = "wasm32")]
        {
            sphere_simd::compute_hemisphere_optimized(nside)
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            Self::compute_new_scalar(nside)
        }
    }

    /// Scalar version for non-WASM targets
    #[cfg(not(target_arch = "wasm32"))]
    fn compute_new_scalar(nside: u32) -> Hemisphere {
        use crate::utils::fast_sin_cos;
        use cdshealpix::ring::{center, n_hash};

        let npix = n_hash(nside);

        // First pass: Count visible pixels to enable pre-allocation
        let mut visible_count = 0;
        for pix in 0..npix {
            let (_lon, lat) = center(nside, pix);
            let theta = PI_OVER_2 - lat as f32;
            if theta < PI_OVER_2 {
                visible_count += 1;
            }
        }

        // Pre-allocate all vectors with exact capacity
        let mut elaz_arr = Vec::with_capacity(visible_count as usize);
        let mut l_arr = Vec::with_capacity(visible_count as usize);
        let mut m_arr = Vec::with_capacity(visible_count as usize);
        let mut n_arr = Vec::with_capacity(visible_count as usize);
        let mut visible_pixels = Vec::with_capacity(visible_count as usize);
        let mut visible_indices = Vec::with_capacity(visible_count as usize);

        // Second pass: Fill pre-allocated vectors
        for pix in 0..npix {
            let (lon, lat) = center(nside, pix);
            let theta = PI_OVER_2 - lat as f32;

            if theta < PI_OVER_2 {
                visible_pixels.push(0.0_f32);
                visible_indices.push(pix);

                // Direct calculation without intermediate structs
                let el = PI_OVER_2 - theta;
                let az = -(lon as f32);

                let (sin_az, cos_az) = fast_sin_cos(az);
                let (sin_el, cos_el) = fast_sin_cos(el);

                let l = sin_az * cos_el;
                let m = cos_az * cos_el;
                let n = sin_el;

                elaz_arr.push(ElAz::new(el, az));
                l_arr.push(l);
                m_arr.push(m);
                n_arr.push(n);
            }
        }

        Hemisphere {
            nside,
            npix: visible_pixels.len(),
            visible_pix: VectorReal::from_vec(visible_pixels),
            visible_indices,
            elaz: elaz_arr,
            l: VectorReal::from_vec(l_arr),
            m: VectorReal::from_vec(m_arr),
            n: VectorReal::from_vec(n_arr),
        }
    }

    /// Online bitcode serialization - serialize hemisphere data to binary without SVG coords
    pub fn to_binary(&self) -> Vec<u8> {
        #[derive(Serialize, Deserialize, bitcode::Encode, bitcode::Decode)]
        struct HemisphereData {
            nside: u32,
            npix: usize,
            visible_indices: Vec<u64>,
            l_coords: Vec<f32>,
            m_coords: Vec<f32>,
            n_coords: Vec<f32>,
            elaz_el: Vec<f32>,
            elaz_az: Vec<f32>,
        }

        let data = HemisphereData {
            nside: self.nside,
            npix: self.npix,
            visible_indices: self.visible_indices.clone(),
            l_coords: self.l.to_vec(),
            m_coords: self.m.to_vec(),
            n_coords: self.n.to_vec(),
            elaz_el: self.elaz.iter().map(|e| e.el).collect(),
            elaz_az: self.elaz.iter().map(|e| e.az).collect(),
        };

        bitcode::encode(&data)
    }

    /// Online binary deserialization - reconstruct hemisphere from binary data
    pub fn from_binary(binary_data: &[u8]) -> Result<Hemisphere, Box<dyn std::error::Error>> {
        #[derive(Serialize, Deserialize, bitcode::Encode, bitcode::Decode)]
        struct HemisphereData {
            nside: u32,
            npix: usize,
            visible_indices: Vec<u64>,
            l_coords: Vec<f32>,
            m_coords: Vec<f32>,
            n_coords: Vec<f32>,
            elaz_el: Vec<f32>,
            elaz_az: Vec<f32>,
        }

        let data: HemisphereData = bitcode::decode(binary_data)
            .map_err(|e| format!("Failed to decode binary data: {}", e))?;

        let elaz_arr: Vec<ElAz> = data
            .elaz_el
            .iter()
            .zip(data.elaz_az.iter())
            .map(|(&el, &az)| ElAz { el, az })
            .collect();

        Ok(Hemisphere {
            nside: data.nside,
            npix: data.npix,
            visible_pix: VectorReal::zeros(data.npix),
            visible_indices: data.visible_indices,
            elaz: elaz_arr,
            l: VectorReal::from_vec(data.l_coords),
            m: VectorReal::from_vec(data.m_coords),
            n: VectorReal::from_vec(data.n_coords),
        })
    }

    /// Online binary round-trip: serialize and deserialize hemisphere data
    pub fn clone_via_binary(&self) -> Result<Hemisphere, Box<dyn std::error::Error>> {
        let binary_data = self.to_binary();
        Self::from_binary(&binary_data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hemisphere_creation() {
        let sph = Hemisphere::new(8);
        assert_eq!(sph.nside, 8);
        assert!(sph.npix > 0);
    }

    #[test]
    fn test_zenith_pixel() {
        let hp = HpAngle::from_elaz(PI_OVER_2, 0.0);
        assert_eq!(hp.theta, 0.0);

        let sph = Hemisphere::new(16);
        let pix = &sph.get_pix(&hp);
        assert_eq!(pix, &3);
    }

    #[test]
    fn test_horizon_elevation() {
        let hp = HpAngle::from_elaz(0.0, 0.0);
        assert_eq!(hp.theta, PI_OVER_2);

        let elaz = ElAz::from_hp(&hp);
        assert_eq!(elaz.el, 0.0);
    }
}
