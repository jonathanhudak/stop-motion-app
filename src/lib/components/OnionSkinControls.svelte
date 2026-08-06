<script lang="ts">
	export let enabled = true;
	export let opacity = 0.35;
</script>

<div class="field">
	<label class="checkbox">
		<input type="checkbox" bind:checked={enabled} />
		Onion skin
	</label>
	<input
		aria-label="Onion skin opacity"
		type="range"
		min="0.1"
		max="0.9"
		step="0.05"
		disabled={!enabled}
		bind:value={opacity}
	/>
	<p class="hint">Ghosts the previous frame over the live view so you can line up the next move.</p>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
	}

	.hint {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
</style>
