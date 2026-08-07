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
	<p class="hint">
		{cameras.length} camera{cameras.length === 1 ? '' : 's'} detected. Only UVC devices appear here: webcams
		and HDMI capture cards do, a DSLR only if it has a USB streaming or webcam mode switched on.
	</p>
	{#if cameras.length > 0}
		<details class="detected">
			<summary>What the browser sees</summary>
			<ul>
				{#each cameras as camera (camera.deviceId)}
					<li>{camera.label}</li>
				{/each}
			</ul>
		</details>
	{/if}
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

	.detected {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.detected summary {
		cursor: pointer;
	}

	.detected ul {
		margin: 0.3rem 0 0;
		padding-left: 1.1rem;
		word-break: break-word;
	}
</style>
