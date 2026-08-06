<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { FPS_PRESETS, MAX_FPS, MIN_FPS } from '$lib/playback';

	export let fps: number;
	export let loop = true;
	export let playing = false;
	export let canPlay = false;

	const dispatch = createEventDispatcher<{ play: void; stop: void; fps: number }>();
</script>

<div class="field">
	{#if playing}
		<button on:click={() => dispatch('stop')}>Stop playback</button>
	{:else}
		<button disabled={!canPlay} on:click={() => dispatch('play')}>Play</button>
	{/if}

	<label for="fps-slider">Frame rate: {fps} fps</label>
	<input
		id="fps-slider"
		type="range"
		min={MIN_FPS}
		max={MAX_FPS}
		step="1"
		value={fps}
		on:input={(event) => dispatch('fps', Number(event.currentTarget.value))}
	/>
	<div class="presets">
		{#each FPS_PRESETS as preset (preset)}
			<button class="preset" class:active={fps === preset} on:click={() => dispatch('fps', preset)}>
				{preset}
			</button>
		{/each}
	</div>
	<label class="checkbox">
		<input type="checkbox" bind:checked={loop} />
		Loop
	</label>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.presets {
		display: flex;
		gap: 0.25rem;
	}

	.preset {
		flex: 1;
		min-width: 0;
		padding: 0.35rem 0;
		font-size: 0.85rem;
	}

	.preset.active {
		border-color: var(--accent);
		background: var(--accent-soft);
		font-weight: 600;
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
		text-transform: none;
		letter-spacing: normal;
		color: var(--text);
	}
</style>
