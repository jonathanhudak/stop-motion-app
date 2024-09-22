import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/kit/vite';

export default defineConfig({
	server: { https: true },
	plugins: [sveltekit(), mkcert()],
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			fallback: '404.html'
		})
	}
});

config.paths = { base: process.argv.includes('dev') ? '' : process.env.BASE_PATH };

export default config;
