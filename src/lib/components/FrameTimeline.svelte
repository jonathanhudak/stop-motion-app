<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let frames: Blob[] = [];
	export let activeIndex = -1;
	export let showAddButton = false;
	/** Supplied by the parent so object URLs stay cached in one place. */
	export let urlFor: (frame: Blob) => string;

	const dispatch = createEventDispatcher<{ select: number; add: void; remove: number }>();
</script>

<div class="timeline" role="list">
	{#each frames as frame, index (frame)}
		<div class="slot" role="listitem">
			<button
				class="frame"
				class:active={index === activeIndex}
				aria-label={`Frame ${index + 1}`}
				aria-current={index === activeIndex}
				on:click={() => dispatch('select', index)}
			>
				<span class="number">{index + 1}</span>
				<img src={urlFor(frame)} alt="" />
			</button>
			<button
				class="remove"
				aria-label={`Delete frame ${index + 1}`}
				on:click={() => dispatch('remove', index)}
			>
				×
			</button>
		</div>
	{/each}

	{#if showAddButton}
		<button class="add" on:click={() => dispatch('add')}>
			<span aria-hidden="true">+</span>
			<span class="add-label">Shoot more</span>
		</button>
	{/if}

	{#if frames.length === 0 && !showAddButton}
		<p class="empty">No frames yet. Press <kbd>Space</kbd> to capture the first one.</p>
	{/if}
</div>

<style>
	.timeline {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
		overflow-x: auto;
		padding: 0.75rem 0;
		scrollbar-width: thin;
	}

	.slot {
		position: relative;
		flex: 0 0 auto;
	}

	.frame {
		display: block;
		padding: 0;
		border: 2px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--surface-sunken);
		opacity: 0.65;
		transition:
			border-color 0.15s,
			opacity 0.15s;
	}

	.frame:hover {
		opacity: 0.9;
	}

	.frame.active {
		border-color: var(--accent);
		opacity: 1;
	}

	.frame img {
		display: block;
		width: 96px;
		height: 66px;
		object-fit: cover;
	}

	@media (min-width: 768px) {
		.frame img {
			width: 132px;
			height: 90px;
		}
	}

	.number {
		position: absolute;
		top: 4px;
		left: 4px;
		padding: 1px 5px;
		border-radius: var(--radius-sm);
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
		font-size: 0.7rem;
	}

	/* Per-frame delete, so removing frame 3 does not mean selecting it first. */
	.remove {
		position: absolute;
		top: 2px;
		right: 2px;
		width: 1.4rem;
		height: 1.4rem;
		padding: 0;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.6);
		border-color: transparent;
		color: #fff;
		font-size: 0.9rem;
		line-height: 1;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.slot:hover .remove,
	.remove:focus-visible {
		opacity: 1;
	}

	.remove:hover {
		background: var(--danger);
		border-color: var(--danger);
	}

	.add {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		width: 96px;
		border-style: dashed;
		color: var(--text-muted);
	}

	.add span:first-child {
		font-size: 1.6rem;
		line-height: 1;
	}

	.add-label {
		font-size: 0.7rem;
	}

	@media (min-width: 768px) {
		.add {
			width: 132px;
		}
	}

	.empty {
		margin: 0;
		padding: 1rem 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
</style>
