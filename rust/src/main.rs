//
// Copyright (c) 2019-2024 Tim Molteno tim@elec.ac.nz
//
use gridlesslib::cli;

fn main() {
    std::process::exit(match cli::run() {
        Ok(()) => 0,
        Err(err) => {
            eprintln!("Error: {}", err);
            err.exit_code()
        }
    });
}
