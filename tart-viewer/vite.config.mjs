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
		include: ["apexcharts"],
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
					apexcharts: ["apexcharts"],
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
	},
});
