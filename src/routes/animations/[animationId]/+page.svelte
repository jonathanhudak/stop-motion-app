<script lang="ts">
	import { page } from '$app/stores';
	import AnimationEditor from '$lib/components/AnimationEditor.svelte';

	$: animationId = $page.params.animationId;
	$: console.log('Animation ID:', animationId);
</script>

{#if animationId}
	<AnimationEditor id={animationId} />
{:else}
	<p>Loading animation...</p>
{/if}

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}
</style>
