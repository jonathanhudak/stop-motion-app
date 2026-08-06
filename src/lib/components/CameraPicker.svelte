<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { CameraDevice } from '$lib/camera';

	export let cameras: CameraDevice[] = [];
	export let selectedDeviceId: string | null = null;

	const dispatch = createEventDispatcher<{ select: string | null; refresh: void }>();
</script>

<div class="field">
	<label for="camera-select">Camera</label>
	<div class="row">
		<select
			id="camera-select"
			bind:value={selectedDeviceId}
			on:change={() => dispatch('select', selectedDeviceId)}
		>
			{#if cameras.length === 0}
				<option value={null}>Default camera</option>
			{/if}
			{#each cameras as camera (camera.deviceId)}
				<option value={camera.deviceId}>{camera.label}</option>
			{/each}
		</select>
		<button title="Look for newly connected cameras" on:click={() => dispatch('refresh')}>
			Refresh
		</button>
	</div>
	<p class="hint">USB webcams and capture cards appear here. A DSLR needs webcam mode.</p>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.row {
		display: flex;
		gap: 0.35rem;
	}

	select {
		flex: 1;
		min-width: 0;
	}

	.hint {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
</style>
