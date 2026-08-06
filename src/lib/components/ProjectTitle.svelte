<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let name = '';
	export let frameCount = 0;
	export let fps = 12;

	let editing = false;
	let draft = '';

	const dispatch = createEventDispatcher<{ rename: string }>();

	function startEditing() {
		draft = name;
		editing = true;
	}

	function save() {
		const trimmed = draft.trim();
		if (!trimmed) return;
		dispatch('rename', trimmed);
		editing = false;
	}

	$: seconds = frameCount > 0 ? (frameCount / fps).toFixed(1) : '0.0';
</script>

<header>
	{#if editing}
		<form class="edit" on:submit|preventDefault={save}>
			<!-- svelte-ignore a11y-autofocus -->
			<input
				type="text"
				bind:value={draft}
				aria-label="Animation name"
				autofocus
				on:keydown={(event) => event.key === 'Escape' && (editing = false)}
			/>
			<button class="primary" type="submit">Save</button>
			<button type="button" on:click={() => (editing = false)}>Cancel</button>
		</form>
	{:else}
		<h1>
			{name}
			<button class="edit-button" on:click={startEditing}>Rename</button>
		</h1>
		<p class="meta">
			{frameCount} frame{frameCount === 1 ? '' : 's'} · {fps} fps · {seconds}s
		</p>
	{/if}
</header>

<style>
	header {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1rem;
	}

	h1 {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
		font-size: 1.5rem;
	}

	.meta {
		margin: 0.2rem 0 0;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.edit-button {
		padding: 0.25rem 0.6rem;
		font-size: 0.8rem;
	}

	.edit {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.edit input {
		flex: 1;
		min-width: 10rem;
		font-size: 1.1rem;
	}
</style>
