<script lang="ts">
	import { onMount } from 'svelte';

	let animations: { name: string; frames: string[] }[] = [];

	// Function to load animations from IndexedDB
	function loadAnimations() {
		const request = indexedDB.open('AnimationDB', 1);
		request.onsuccess = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			const transaction = db.transaction(['animations'], 'readonly');
			const objectStore = transaction.objectStore('animations');
			const request = objectStore.getAll();

			request.onsuccess = (event) => {
				animations = (event.target as IDBRequest).result;
			};
		};
	}

	onMount(() => {
		loadAnimations();
	});
</script>

<div class="container">
	{#each animations as animation}
		<div class="tile">
			<a href={`/animations/${animation.name}`}>
				<img class="thumbnail" src={animation.frames[0]} alt={animation.name} />
				<h3>{animation.name}</h3>
			</a>
		</div>
	{/each}
</div>

<style>
	.container {
		display: grid;
		max-width: 1200px;
		margin: auto;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 1rem;
		padding: 1rem;
	}
	.tile {
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 0.5rem;
		text-align: center;
	}
	.thumbnail {
		width: 100%;
		height: auto;
		border-radius: 4px;
	}
</style>
