<ul class="container">
	{#each animations as animation}
		<li class="tile">
			<a href={`/animations/${animation.name}`}>
				<img class="thumbnail" src={animation.frames[0]} alt={animation.name} />
				<h3>{animation.name}</h3>
			</a>
		</li>
	{/each}
</ul>

<style>
	.container {
		list-style: none;
	}
</style>
