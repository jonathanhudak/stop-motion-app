<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { base } from '$app/paths';
	import { listProjects, type Project } from '$lib/db';
	import { createObjectUrlCache } from '$lib/objectUrls';

	let projects: Project[] = [];
	let error: string | null = null;
	const urls = createObjectUrlCache();

	onMount(async () => {
		try {
			projects = await listProjects();
			urls.prune(projects.flatMap((p) => p.frames.slice(0, 1)));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	});

	onDestroy(() => urls.revokeAll());

	function frameCount(project: Project) {
		return `${project.frames.length} frame${project.frames.length === 1 ? '' : 's'}`;
	}
</script>

{#if error}
	<p class="error">{error}</p>
{/if}

<div class="container">
	{#each projects as project (project.id)}
		<div class="tile">
			<a href={`${base}/animations/${project.id}/`}>
				{#if project.frames.length > 0}
					<img class="thumbnail" src={urls.get(project.frames[0])} alt={project.name} />
				{:else}
					<div class="thumbnail empty">No frames</div>
				{/if}
				<h3>{project.name}</h3>
			</a>
			<p class="meta">{frameCount(project)} · {project.fps} fps</p>
		</div>
	{/each}
</div>

{#if projects.length === 0 && !error}
	<p class="empty-state">No animations yet. <a href="{base}/">Shoot one</a>.</p>
{/if}

<style>
	.container {
		display: grid;
		max-width: 1200px;
		margin: auto;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 1rem;
		padding: 1rem;
	}
	.tile {
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 0.5rem;
		text-align: center;
	}

	:global(.dark .tile a) {
		color: white;
	}

	.thumbnail {
		width: 100%;
		height: auto;
		border-radius: 4px;
	}

	.thumbnail.empty {
		aspect-ratio: 4 / 3;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #eee;
		color: #666;
		font-size: 0.85rem;
	}

	.meta {
		margin: 0;
		font-size: 0.8rem;
		color: #666;
	}

	.empty-state,
	.error {
		text-align: center;
		padding: 1rem;
	}

	.error {
		color: #b00020;
	}

	:global(.dark) .empty-state,
	:global(.dark) .meta {
		color: #bbb;
	}
</style>
