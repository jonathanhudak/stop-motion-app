<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	export let id: string | null = null;

	let video: HTMLVideoElement;
	let canvas: HTMLCanvasElement;
	let context: CanvasRenderingContext2D | null;
	let currentFacingMode: 'user' | 'environment' = 'user';
	let frames: string[] = [];
	let isPreviewActive = !id; // Preview is inactive if an id is provided
	let previewRequestId: number | null = null;
	let videoWidth: number, videoHeight: number;
	let filter: string = 'none';
	let currentAnimationName: string = '';
	let db: IDBDatabase | null = null;

	// Function to start the camera
	function startCamera(facingMode: 'user' | 'environment') {
		navigator.mediaDevices
			.getUserMedia({ video: { facingMode: facingMode } })
			.then((stream) => {
				if (video) {
					video.srcObject = stream;
					video.play();
					video.onloadedmetadata = () => {
						videoWidth = video.videoWidth;
						videoHeight = video.videoHeight;
						if (canvas) {
							canvas.width = videoWidth;
							canvas.height = videoHeight;
						}
					};
					drawPreview();
				}
			})
			.catch((err) => {
				console.error('Error accessing camera: ', err);
				alert("can't start camera");
			});
	}

	function drawPreview() {
		if (isPreviewActive && context && video) {
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
			previewRequestId = requestAnimationFrame(drawPreview);
		}
	}

	// Function to apply selected filter
	function applyFilter() {
		if (context) {
			context.filter = filter === 'none' ? 'none' : filter + '(100%)';
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
		}
	}

	// Function to capture frame
	function captureFrame() {
		const frame = canvas.toDataURL('image/png');
		frames.push(frame);
		frames = frames; // Trigger Svelte reactivity
		applyFilter();
	}

	// Function to delete current frame
	function deleteCurrentFrame() {
		frames.pop();
		context?.clearRect(0, 0, canvas.width, canvas.height);
	}

	// Function to toggle preview
	function togglePreview() {
		isPreviewActive = !isPreviewActive;
		if (isPreviewActive) {
			drawPreview();
		} else {
			if (previewRequestId) {
				cancelAnimationFrame(previewRequestId);
			}
		}
	}

	// Function to play animation
	async function playAnimation() {
		if (isPreviewActive) {
			isPreviewActive = false;
			if (previewRequestId) {
				cancelAnimationFrame(previewRequestId);
			}
		}

		if (frames.length === 0) {
			console.log('No frames to play');
			return;
		}

		for (let i = 0; i < frames.length; i++) {
			await new Promise<void>((resolve) => {
				const img = new Image();
				img.onload = () => {
					if (context) {
						context.clearRect(0, 0, canvas.width, canvas.height);
						context.drawImage(img, 0, 0, canvas.width, canvas.height);
					}
					setTimeout(resolve, 100); // Adjust frame rate here (100ms = 10fps)
				};
				img.src = frames[i];
			});
		}

		console.log('Animation playback completed');
	}

	// Function to switch camera
	function switchCamera() {
		currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
		startCamera(currentFacingMode);
	}

	// Function to save animation
	function saveAnimation() {
		const name = currentAnimationName.trim();
		if (!name) {
			alert('Please enter a name for the animation.');
			return;
		}
		if (frames.length === 0) {
			alert('Please capture at least one frame.');
			return;
		}
		const transaction = db?.transaction(['animations'], 'readwrite');
		const objectStore = transaction?.objectStore('animations');
		const animation = { name: name, frames: frames };
		const request = objectStore?.put(animation);
		if (request) {
			request.onerror = (event) => {
				console.error('Error saving animation:', event);
				alert('Error saving animation. Please try again.');
			};

			request.onsuccess = (event) => {
				updateLoadAnimationSelect();
				alert('Animation saved successfully!');
			};
		}
	}

	// Function to load animation
	function loadAnimation() {
		const select = document.getElementById('loadAnimationSelect') as HTMLSelectElement;
		const name = select.value;
		if (name && db) {
			const transaction = db.transaction(['animations'], 'readonly');
			const objectStore = transaction.objectStore('animations');
			const request = objectStore.get(name);

			request.onerror = (event: Event) => {
				console.error('Error loading animation:', (event.target as IDBRequest).error);
				alert('Error loading animation. Please try again.');
			};

			request.onsuccess = (event: Event) => {
				const animation = (event.target as IDBRequest).result;
				if (animation) {
					frames = animation.frames;
					if (frames.length > 0) {
						const img = new Image();
						img.src = frames[0];
						img.onload = () => {
							if (context) {
								context.clearRect(0, 0, canvas.width, canvas.height);
								context.drawImage(img, 0, 0);
							}
						};
					}
				}
			};
		} else {
			console.error('Database not initialized or animation name is empty');
		}
	}

	// Event listeners for saving and loading animations
	onMount(() => {
		video = document.getElementById('video') as HTMLVideoElement;
		canvas = document.getElementById('canvas') as HTMLCanvasElement;
		context = canvas.getContext('2d');
		if (!id) {
			startCamera(currentFacingMode);
			drawPreview();
		}

		openDB().then(() => {
			if (id) {
				loadAnimationById(id);
			}
		});
	});

	// Function to open the database
	function openDB(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open('AnimationDB', 1);

			request.onerror = (event) => {
				console.error('Database error: ', (event.target as IDBOpenDBRequest).error);
				reject(new Error('Failed to open database'));
			};

			request.onsuccess = (event) => {
				db = (event.target as IDBOpenDBRequest).result;
				console.log('Database opened successfully');
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains('animations')) {
					db.createObjectStore('animations', { keyPath: 'name' });
					console.log('Object store created');
				}
			};
		});
	}

	async function loadAnimationById(animationId: string) {
		if (!db) {
			console.error('Database not initialized');
			return;
		}

		try {
			const transaction = db.transaction(['animations'], 'readonly');
			const objectStore = transaction.objectStore('animations');
			const request = objectStore.get(animationId);

			request.onerror = (event: Event) => {
				console.error('Error loading animation:', (event.target as IDBRequest).error);
				alert('Error loading animation. Please try again.');
			};

			request.onsuccess = (event: Event) => {
				const animation = (event.target as IDBRequest).result;
				if (animation) {
					console.log('Animation loaded:', animation);
					frames = animation.frames;
					console.log('Frames loaded:', frames.length);
					currentAnimationName = animation.name;
					if (frames.length > 0) {
						const img = new Image();
						img.onload = () => {
							if (canvas && context) {
								canvas.width = img.width;
								canvas.height = img.height;
								context.clearRect(0, 0, canvas.width, canvas.height);
								context.drawImage(img, 0, 0, canvas.width, canvas.height);
							}
						};
						img.src = frames[0];
					}
				} else {
					console.log('No animation found with ID:', animationId);
					alert('Animation not found');
				}
			};
		} catch (error) {
			console.error('Error in loadAnimationById:', error);
			alert('An error occurred while loading the animation');
		}
	}

	function updateLoadAnimationSelect() {
		const select = document.getElementById('loadAnimationSelect') as HTMLSelectElement;
		if (!select) {
			console.error('Load animation select not found');
			return;
		}
		select.innerHTML = '<option value="">Load Animation</option>';
		if (db) {
			const transaction = db.transaction(['animations'], 'readonly');
			const objectStore = transaction.objectStore('animations');
			const request = objectStore.getAllKeys();
			request.onsuccess = (event) => {
				const keys = (event.target as IDBRequest).result;
				keys.forEach((key: IDBValidKey) => {
					const option = document.createElement('option');
					option.value = key.toString();
					option.textContent = key.toString();
					select.appendChild(option);
				});
			};
			request.onerror = (event) => {
				console.error('Error loading animation keys:', event);
			};
		} else {
			console.error('Database not initialized');
		}
	}

	function newAnimation() {
		frames = [];
		currentAnimationName = '';
		if (context) {
			context.clearRect(0, 0, canvas.width, canvas.height);
		}
	}

	// Add this function
	async function deleteAnimation() {
		if (!currentAnimationName || !db) {
			alert('No animation selected or database not initialized.');
			return;
		}

		const confirmDelete = confirm(`Are you sure you want to delete "${currentAnimationName}"?`);
		if (!confirmDelete) return;

		try {
			const transaction = db.transaction(['animations'], 'readwrite');
			const objectStore = transaction.objectStore('animations');
			const request = objectStore.delete(currentAnimationName);

			request.onerror = (event) => {
				console.error('Error deleting animation:', event);
				alert('Error deleting animation. Please try again.');
			};

			request.onsuccess = (event) => {
				console.log('Animation deleted successfully');
				alert('Animation deleted successfully!');
				goto('/'); // Navigate to the root route
			};
		} catch (error) {
			console.error('Error in deleteAnimation:', error);
			alert('An error occurred while deleting the animation');
		}
	}
</script>

<div class="container">
	<div class="canvas-container">
		<video id="video" hidden autoplay playsinline>
			<track kind="captions" src="" label="Empty captions" />
		</video>
		<canvas id="canvas"></canvas>
	</div>
	<div class="controls">
		{#if !id}
			<button on:click={captureFrame}>Capture Frame</button>
			<button on:click={switchCamera}>Switch Camera</button>
			<button on:click={togglePreview}>{isPreviewActive ? 'Stop Preview' : 'Start Preview'}</button>
		{/if}
		<button on:click={playAnimation}>Play Animation</button>
		<button on:click={deleteCurrentFrame}>Delete Current Frame</button>
		<select bind:value={filter}>
			<option value="none">None</option>
			<option value="grayscale">Grayscale</option>
			<option value="sepia">Sepia</option>
		</select>
		<input type="text" bind:value={currentAnimationName} placeholder="Animation name" />
		<button on:click={saveAnimation}>Save Animation</button>
		<!-- Add this button -->
		{#if id !== null}
			<button on:click={deleteAnimation} class="delete-button">Delete Animation</button>
		{/if}
	</div>
</div>

<style>
	.container {
		width: 100%;
		max-width: 1200px; /* Increased from 800px */
		margin: 0 auto;
		padding: 1rem;
		box-sizing: border-box;
	}
	.canvas-container {
		width: 100%;
		aspect-ratio: 4 / 3; /* Changed from 16 / 9 for a larger vertical space */
		overflow: hidden;
		margin-bottom: 1rem;
	}
	canvas {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		position: sticky;
		bottom: 1rem;
		left: 0;
	}
	button,
	select,
	input {
		flex-grow: 1;
		min-width: 120px;
		padding: 0.75rem 0.5rem;
		font-size: 1rem;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
	}
	button {
		cursor: pointer;
		background-color: #4caf50;
		color: white;
		border: none;
		border-radius: 4px;
		transition: background-color 0.3s;
	}
	button:active {
		background-color: #45a049;
	}
	select,
	input {
		background-color: #f8f8f8;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	.delete-button {
		background-color: #f44336;
	}

	.delete-button:active {
		background-color: #d32f2f;
	}
</style>
