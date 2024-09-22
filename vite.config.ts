import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import adapter from '@sveltejs/adapter-vercel';

export default defineConfig({
	server: { https: true },
	plugins: [sveltekit(), ...(process.env.NODE_ENV === 'production' ? [] : [mkcert()])],
	kit: {
		adapter: adapter({
			runtime: 'nodejs18.x'
		})
	}
});
