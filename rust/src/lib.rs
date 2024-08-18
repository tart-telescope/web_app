//
// Copyright (c) 2019-2024 Tim Molteno tim@elec.ac.nz
//
// https://depth-first.com/articles/2020/07/07/rust-and-webassembly-from-scratch-hello-world-with-strings/
// TODO switch to the above model of Linear Memory.

extern crate gloo_utils;
extern crate ndarray;
extern crate serde;
extern crate serde_json;
extern crate wasm_bindgen;
extern crate web_sys;
#[macro_use]
extern crate serde_derive;
extern crate cdshealpix;
extern crate chrono;
extern crate num;

pub mod gridless;
pub mod img;

mod sphere;
mod sphere_plot;
mod svg;
mod tart_api;
mod tart_obs;
mod utils;

use chrono::{DateTime, Utc};

use sphere::Hemisphere;
use tart_api::FullDataset;

use tart_api::Source;
use tart_obs::Observation;
use utils::{VectorComplex, VectorReal};

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;

// https://rustwasm.github.io/wasm-bindgen/contributing/design/exporting-rust-struct.html

#[wasm_bindgen]
pub struct SVG {
    internal: String
}

#[wasm_bindgen]
impl SVG {
    #[wasm_bindgen(constructor)]
    pub fn new() -> SVG {
        SVG { internal: "Hello".to_string() }
    }

    #[wasm_bindgen]
    pub fn get(&self) -> JsValue {
        JsValue::from_str(&self.internal)
    }

    // pub fn set(&mut self, val: String) {
    //     self.internal = val;
    // }
    #[wasm_bindgen]
    pub fn json_to_svg_ext(&mut self, json: String, nside: u32, show_sources: bool) {
        // https://rustwasm.github.io/wasm-bindgen/reference/arbitrary-data-with-serde.html
        // https://stackoverflow.com/questions/78000437/allocating-deallocating-memory-in-rust-compiled-to-webassembly
        let data = tart_api::json_to_dataset(&json);
        let obs = get_obs_from_dataset(&data);

        let (u, v, w) = img::get_uvw(&obs.baselines, &obs.ant_x, &obs.ant_y, &obs.ant_z);

        let sources = if show_sources {
            Some(get_sources_from_dataset(&data))
        } else {
            None
        };
        let svg = make_svg(&obs.vis_arr, &u, &v, &w, nside, sources);
        
        self.internal = svg;
        // <JsValue as gloo_utils::format::JsValueSerdeExt>::from_serde(&svg).unwrap()
    }  

}



#[wasm_bindgen]
pub fn json_to_svg_ext(json: String, nside: u32, show_sources: bool) -> JsValue {
    // https://rustwasm.github.io/wasm-bindgen/reference/arbitrary-data-with-serde.html
    // https://stackoverflow.com/questions/78000437/allocating-deallocating-memory-in-rust-compiled-to-webassembly
    let data = tart_api::json_to_dataset(&json);
    let obs = get_obs_from_dataset(&data);

    let (u, v, w) = img::get_uvw(&obs.baselines, &obs.ant_x, &obs.ant_y, &obs.ant_z);

    let sources = if show_sources {
        Some(get_sources_from_dataset(&data))
    } else {
        None
    };
    let svg = make_svg(&obs.vis_arr, &u, &v, &w, nside, sources);

    JsValue::from_str(&svg)

}  

pub fn make_svg(
    vis: &VectorComplex,
    u: &VectorReal,
    v: &VectorReal,
    w: &VectorReal,
    nside: u32,
    sources: Option<&Vec<Source>>,
) -> String {
    let mut sky = Hemisphere::new(nside);

    gridless::image_visibilities(&vis, &u, &v, &w, &mut sky, false);
    return sky.to_svg(true, sources).to_string();
}


pub fn json_to_svg(json: &String, nside: u32, show_sources: bool) -> (String, DateTime<Utc>) {
    let data = tart_api::json_to_dataset(&json);
    let obs = get_obs_from_dataset(&data);

    let (u, v, w) = img::get_uvw(&obs.baselines, &obs.ant_x, &obs.ant_y, &obs.ant_z);

    let sources = if show_sources {
        Some(get_sources_from_dataset(&data))
    } else {
        None
    };

    return (
        make_svg(&obs.vis_arr, &u, &v, &w, nside, sources),
        obs.timestamp,
    );
}

pub fn file_to_dataset(fname: &str) -> FullDataset {
    let data = tart_api::file_to_dataset(&fname);
    return data;
}

pub fn get_obs_from_dataset(data: &FullDataset) -> Observation {
    let obs = tart_obs::get_full(&data);
    return obs;
}

pub fn get_sources_from_dataset(data: &FullDataset) -> &Vec<Source> {
    let sources = tart_obs::get_sources(&data);
    return sources;
}

pub fn get_uvw_from_obs(obs: &Observation) -> (VectorReal, VectorReal, VectorReal) {
    let (u, v, w) = img::get_uvw(&obs.baselines, &obs.ant_x, &obs.ant_y, &obs.ant_z);

    return (u, v, w);
}
