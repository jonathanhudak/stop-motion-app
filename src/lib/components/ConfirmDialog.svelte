<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let open = false;
	export let title = 'Are you sure?';
	export let message = '';
	export let confirmLabel = 'Delete';
	export let cancelLabel = 'Cancel';

	const dispatch = createEventDispatcher<{ confirm: void; cancel: void }>();

	let confirmButton: HTMLButtonElement | undefined;

	// Focus the confirm button when the dialog appears, so Enter and Escape work
	// without reaching for the mouse.
	$: if (open && confirmButton) confirmButton.focus();

	function onKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') {
			event.stopPropagation();
			dispatch('cancel');
		}
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
	<div class="backdrop">
		<!-- A real button rather than a div with a click handler: clicking outside
		     the dialog cancels, and it stays reachable without a mouse. -->
		<button class="scrim" aria-label={cancelLabel} on:click={() => dispatch('cancel')}></button>
		<div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
			<h2>{title}</h2>
			{#if message}<p>{message}</p>{/if}
			<div class="actions">
				<button on:click={() => dispatch('cancel')}>{cancelLabel}</button>
				<button bind:this={confirmButton} class="danger" on:click={() => dispatch('confirm')}>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.45);
	}

	.scrim {
		position: absolute;
		inset: 0;
		padding: 0;
		border: none;
		border-radius: 0;
		background: transparent;
		cursor: default;
	}

	.scrim:hover {
		background: transparent;
	}

	.dialog {
		position: relative;
		width: min(24rem, 100%);
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
	}

	p {
		margin: 0 0 1rem;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
