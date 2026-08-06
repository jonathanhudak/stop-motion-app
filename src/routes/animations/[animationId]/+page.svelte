<script lang="ts">
	import AnimationEditor from '$lib/components/AnimationEditor.svelte';

	// SvelteKit passes params to the page component; taking it as a prop avoids the
	// "unknown prop" warning the previous $page-based version produced.
	export let params: { animationId?: string } = {};

	$: animationId = params.animationId ?? null;
</script>

{#if animationId}
	<AnimationEditor id={animationId} />
{:else}
	<p class="loading">Loading animation…</p>
{/if}

<style>
	.loading {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1rem;
		color: var(--text-muted);
	}
</style>
