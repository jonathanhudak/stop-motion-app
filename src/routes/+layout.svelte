<script>
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	let darkMode = false;

	onMount(() => {
		// Check user's preference
		if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
			darkMode = true;
			document.documentElement.classList.add('dark');
		}
		// Listen for changes in user preference
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
			darkMode = e.matches;
		});
	});

	function toggleDarkMode() {
		darkMode = !darkMode;
		document.documentElement.classList.toggle('dark');
	}
</script>

<div>
	<nav>
		<a
			href="{base}/"
			class:active={$page.url.pathname === base || $page.url.pathname === `${base}/`}>Animator</a
		>
		<a href="{base}/animations/" class:active={$page.url.pathname === `${base}/animations/`}
			>My Animations</a
		>
		<button on:click={toggleDarkMode}>
			{darkMode ? '☀️' : '🌙'}
		</button>
	</nav>

	<slot></slot>
</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		height: 100%;
		transition:
			background-color 0.3s,
			color 0.3s;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	}

	:global(.dark) {
		background-color: #141010;
	}

	nav {
		display: flex;
		max-width: 1200px;
		margin: auto;
		gap: 1rem;
		padding: 1rem 0;
	}

	a {
		text-decoration: none;
		padding: 0.5rem 1rem;
		font-size: 1.1rem;
		transition:
			background-color 0.3s,
			color 0.3s;
	}

	.active {
		font-weight: bold;
	}

	:global(.dark nav a.active) {
		color: aqua;
	}

	:global(.dark nav a) {
		color: white;
	}

	button {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.5rem;
		padding: 0.5rem;
	}

	@media (max-width: 600px) {
		a {
			padding: 1rem;
			font-size: 1.2rem;
		}
	}
</style>
