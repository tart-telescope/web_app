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
		rollupOptions: {
			output: {
				manualChunks: {
				},
			},
		},
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
				rewrite: (path) => path.replace(/^\/api\/v1/, ''),
				// rewrite: (path) => path,
				configure: (proxy, _options) => {
					proxy.on('error', (err, _req, _res) => {
						console.log('proxy error', err);

					});
					proxy.on('proxyReq', (proxyReq, req, _res) => {
						console.log('Sending Request to the Target:', req.method, req.url);
					});
					proxy.on('proxyRes', (proxyRes, req, _res) => {
						console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
					});
				},
			},
			'/vis': {
				target: 'http://localhost:1234',
				changeOrigin: true,
				secure: false,
				rewrite: (path) => path,
			},
			'/raw': {
				target: 'http://localhost:1234',
				changeOrigin: true,
				secure: false,
				rewrite: (path) => path,
			},
		},
	},
});
