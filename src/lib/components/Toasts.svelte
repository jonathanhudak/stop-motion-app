<script lang="ts">
	import { dismissToast, toasts } from '$lib/toast';
</script>

<div class="toasts" aria-live="polite">
	{#each $toasts as item (item.id)}
		<div class="toast {item.kind}" role={item.kind === 'error' ? 'alert' : 'status'}>
			<span class="message">{item.message}</span>
			{#if item.action}
				<button
					class="action"
					on:click={() => {
						item.action?.run();
						dismissToast(item.id);
					}}
				>
					{item.action.label}
				</button>
			{/if}
			<button class="close" aria-label="Dismiss" on:click={() => dismissToast(item.id)}>×</button>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		z-index: 20;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: min(30rem, calc(100vw - 2rem));
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--border);
		border-left-width: 4px;
		border-radius: var(--radius-sm);
		background: var(--surface);
		box-shadow: var(--shadow);
		pointer-events: auto;
	}

	.toast.success {
		border-left-color: var(--success);
	}

	.toast.error {
		border-left-color: var(--danger);
	}

	.toast.info {
		border-left-color: var(--accent);
	}

	.message {
		flex: 1;
		font-size: 0.9rem;
	}

	.action {
		padding: 0.3rem 0.6rem;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.close {
		padding: 0.1rem 0.4rem;
		border: none;
		background: none;
		font-size: 1.2rem;
		line-height: 1;
		color: var(--text-muted);
	}

	.close:hover {
		background: none;
		color: var(--text);
	}
</style>
