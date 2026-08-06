<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { base } from '$app/paths';
	import { listProjects, type Project } from '$lib/db';
	import { createObjectUrlCache } from '$lib/objectUrls';
	import { toast } from '$lib/toast';

	let projects: Project[] = [];
	let loading = true;
	const urls = createObjectUrlCache();

	onMount(async () => {
		try {
			projects = await listProjects();
			urls.prune(projects.flatMap((project) => project.frames.slice(0, 1)));
		} catch (error) {
			console.error('Error loading animations:', error);
			toast.error('Could not load your animations.');
		} finally {
			loading = false;
		}
	});

	onDestroy(() => urls.revokeAll());

	function duration(project: Project) {
		return (project.frames.length / project.fps).toFixed(1);
	}
</script>

<div class="page">
	<h1>My animations</h1>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if projects.length === 0}
		<p class="muted">Nothing here yet. <a href="{base}/">Shoot your first animation</a>.</p>
	{:else}
		<ul class="grid">
			{#each projects as project (project.id)}
				<li class="tile">
					<a href={`${base}/animations/${project.id}/`}>
						{#if project.frames.length > 0}
							<img class="thumb" src={urls.get(project.frames[0])} alt="" />
						{:else}
							<div class="thumb empty">No frames</div>
						{/if}
						<h2>{project.name}</h2>
					</a>
					<p class="muted">
						{project.frames.length} frame{project.frames.length === 1 ? '' : 's'} ·
						{project.fps} fps · {duration(project)}s
					</p>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1rem;
	}

	h1 {
		margin: 0 0 1rem;
		font-size: 1.5rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tile {
		padding: 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}

	.tile a {
		display: block;
		color: inherit;
		text-decoration: none;
	}

	.tile a:hover h2 {
		color: var(--accent);
	}

	h2 {
		margin: 0.5rem 0 0;
		font-size: 1rem;
	}

	.thumb {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
	}

	.thumb.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.muted {
		margin: 0.35rem 0 0;
		color: var(--text-muted);
		font-size: 0.8rem;
	}
</style>
