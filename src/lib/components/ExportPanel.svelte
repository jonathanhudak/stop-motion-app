<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let canExportVideo = false;
	export let canShare = false;
	export let busy = false;
	export let status: string | null = null;
	export let hasFrames = false;
	export let exportedName: string | null = null;

	const dispatch = createEventDispatcher<{
		video: void;
		gif: void;
		share: void;
		download: void;
	}>();
</script>

<div class="field">
	<span class="label">Export</span>
	<div class="row">
		{#if canExportVideo}
			<button disabled={!hasFrames || busy} on:click={() => dispatch('video')}>Video</button>
		{/if}
		<button disabled={!hasFrames || busy} on:click={() => dispatch('gif')}>GIF</button>
	</div>

	{#if exportedName}
		<div class="row">
			{#if canShare}
				<button class="primary" on:click={() => dispatch('share')}>Share</button>
			{/if}
			<button on:click={() => dispatch('download')}>Save file</button>
		</div>
	{/if}

	{#if status}
		<span class="status" role="status">{status}</span>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.row {
		display: flex;
		gap: 0.35rem;
	}

	.row button {
		flex: 1;
		min-width: 0;
	}

	.status {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
</style>
