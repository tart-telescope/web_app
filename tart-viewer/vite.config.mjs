import { fileURLToPath, URL } from "node:url";
import Vue from "@vitejs/plugin-vue";
// Plugins
import AutoImport from "unplugin-auto-import/vite";
import Fonts from "unplugin-fonts/vite";
import Components from "unplugin-vue-components/vite";
import VueRouter from "unplugin-vue-router/vite";
// Utilities
import { defineConfig } from "vite";

import topLevelAwait from "vite-plugin-top-level-await";
import Layouts from "vite-plugin-vue-layouts";
import Vuetify, { transformAssetUrls } from "vite-plugin-vuetify";
import wasm from "vite-plugin-wasm";

export default defineConfig({
	base: process.env.BASE_URL || "/",
	optimizeDeps: {
		exclude: ["util", "gridless"],
	},
	assetsInclude: ["**/*.wasm"],
	plugins: [
		wasm(),
		topLevelAwait(),
		VueRouter(),
		Layouts(),
		Vue({
			template: { transformAssetUrls },
		}),
		// https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
		Vuetify({
			autoImport: true,
			styles: {
				configFile: "src/styles/settings.scss",
			},
		}),
		Components(),
		Fonts({
			google: {
				families: [
					{
						name: "Roboto",
						styles: "wght@100;300;400;500;700;900",
						display: "swap",
					},
				],
			},
		}),
		AutoImport({
			imports: ["vue", "vue-router"],
			eslintrc: {
				enabled: true,
			},
			vueTemplate: true,
		}),
	],
	define: { "process.env": {} },
	build: {
		reportCompressedSize: false,
		sourcemap: false,
		cssCodeSplit: false,
		minify: 'esbuild', // Faster than terser
		target: 'es2020', // Modern browsers only, less transpilation
		rollupOptions: {
			output: {
				manualChunks: {},
			},
		},
	},
	esbuild: {
		drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
		target: 'es2020', // Match build target
	},
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("src", import.meta.url)),
		},
		extensions: [".js", ".json", ".jsx", ".mjs", ".ts", ".tsx", ".vue"],
	},
	server: {
		port: 3000,
		proxy: {
			'/api/v1': {
				target: 'http://localhost:1234',
				changeOrigin: true,
				secure: false,
				// rewrite: (path) => path.replace(/^\/api\/v1/, ''), // target api itself
				rewrite: (path) => path, // target nginx
				configure: (proxy, ) => {
					proxy.on('error', (err,  ) => {
						console.log('proxy error', err);

					});
					proxy.on('proxyReq', (proxyReq, req, ) => {
						console.log('Sending Request to the Target:', req.method, req.url);
					});
					proxy.on('proxyRes', (proxyRes, req, ) => {
						console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
					});
				},
			},
			'/vis': {
				target: 'http://localhost:1234',
				changeOrigin: true,
				secure: false,
			},
			'/raw': {
				target: 'http://localhost:1234',
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
