# Frontend

The web frontend in `tart-viewer/` is served as static files:

- as part of the software stack on each TART device at `http://<TART_IP_IN_LOCAL_NETWORK>:80/`
- on hosted on `https://tart.elec.ac.nz/viewer`

# Deploy to TART elec.ac.nz
For deployment on custom basepath we need to set the `BASE_URL` env var.

```bash
  make deploy
```

Wait for entering password for tart@tart.elec.ac.nz


# Development

The `tart-viewer` folder contains the Vue3 frontend code with Vite as the build system.

The `rust` folder contains Rust code that is compiled to WebAssembly and used in the frontend.

The `withoutBundler` folder contains a minimal example of how to use the compiled Rust code in a frontend without a bundler/build system.
