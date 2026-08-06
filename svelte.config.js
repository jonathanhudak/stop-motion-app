import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// GitHub Pages serves static files only, and uses 404.html for any path
		// that isn't a real file, which lets client-side routing handle
		// /animations/[animationId].
		adapter: adapter({
			fallback: '404.html'
		}),
		paths: {
			base: process.env.BASE_PATH ?? ''
		},
		alias: {
			$lib: './src/lib/*'
		}
	}
};

export default config;
