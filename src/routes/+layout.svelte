<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import Toasts from '$lib/components/Toasts.svelte';

	let darkMode = false;

	function applyTheme(dark: boolean) {
		darkMode = dark;
		document.documentElement.classList.toggle('dark', dark);
	}

	onMount(() => {
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		applyTheme(query.matches);

		// The old version tracked the preference in a variable but never applied
		// it, so following the system theme only worked on first load.
		const onChange = (event: MediaQueryListEvent) => applyTheme(event.matches);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});

	$: isHome = $page.url.pathname === base || $page.url.pathname === `${base}/`;
</script>

<div class="shell">
	<nav>
		<a href="{base}/" class:active={isHome}>Shoot</a>
		<a href="{base}/animations/" class:active={$page.url.pathname === `${base}/animations/`}>
			My animations
		</a>
		<button
			class="theme"
			aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
			on:click={() => applyTheme(!darkMode)}
		>
			{darkMode ? '☀️' : '🌙'}
		</button>
	</nav>

	<main>
		<slot></slot>
	</main>
</div>

<Toasts />

<style>
	.shell {
		min-height: 100vh;
	}

	nav {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		max-width: 1200px;
		margin: 0 auto;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--border);
	}

	a {
		padding: 0.55rem 0.75rem;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: 1rem;
		text-decoration: none;
	}

	a:hover {
		background: var(--surface-sunken);
		color: var(--text);
	}

	.active {
		background: var(--accent-soft);
		color: var(--text);
		font-weight: 600;
	}

	.theme {
		margin-left: auto;
		border: none;
		background: none;
		font-size: 1.25rem;
		padding: 0.4rem 0.5rem;
	}

	.theme:hover {
		background: var(--surface-sunken);
	}
</style>
