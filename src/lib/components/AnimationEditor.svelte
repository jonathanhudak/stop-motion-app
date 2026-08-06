<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import {
		canvasToBlob,
		createProject,
		deleteProject,
		getProject,
		getProjectByName,
		renameProject,
		saveProject,
		DEFAULT_FPS,
		type Project
	} from '$lib/db';
	import { createObjectUrlCache } from '$lib/objectUrls';
	import {
		cameraErrorMessage,
		describeStream,
		listCameras,
		loadPreferredDeviceId,
		onDeviceChange,
		openCamera,
		savePreferredDeviceId,
		stopStream,
		type CameraDevice
	} from '$lib/camera';

	/** Project id, or a legacy name-based id from an older link. */
	export let id: string | null = null;

	let video: HTMLVideoElement;
	let canvas: HTMLCanvasElement;
	let context: CanvasRenderingContext2D | null;
	let stream: MediaStream | null = null;
	let cameras: CameraDevice[] = [];
	let selectedDeviceId: string | null = null;
	let cameraError: string | null = null;
	let aspectRatio = 4 / 3;
	let project: Project | null = null;
	let frames: Blob[] = [];
	let fps: number = DEFAULT_FPS;
	let isPreviewActive = !id; // Preview is inactive if an id is provided
	let previewRequestId: number | null = null;
	let videoWidth: number, videoHeight: number;
	let filter: string = 'none';
	let currentAnimationName: string = '';
	let currentFrameIndex: number = -1;
	let isEditing = false;
	let isPlaying = false;
	let editedName = '';

	const urls = createObjectUrlCache();
	$: urls.prune(frames);

	async function startCamera(deviceId: string | null = selectedDeviceId) {
		stopStream(stream); // Never hold two streams: the old device stays lit otherwise.
		stream = null;
		cameraError = null;

		try {
			stream = await openCamera(deviceId);
		} catch (error) {
			console.error('Error accessing camera: ', error);
			cameraError = cameraErrorMessage(error);
			return;
		}

		// openCamera may have fallen back to a different device than requested.
		const info = describeStream(stream);
		selectedDeviceId = info.deviceId;
		savePreferredDeviceId(info.deviceId);

		if (info.width && info.height) {
			aspectRatio = info.width / info.height;
			videoWidth = info.width;
			videoHeight = info.height;
			if (canvas) {
				canvas.width = info.width;
				canvas.height = info.height;
			}
		}

		if (video) {
			video.srcObject = stream;
			video.play().catch(() => {}); // Autoplay rejection is not fatal; the frame loop still draws.
			video.onloadedmetadata = () => {
				videoWidth = video.videoWidth;
				videoHeight = video.videoHeight;
				if (videoWidth && videoHeight) {
					aspectRatio = videoWidth / videoHeight;
					if (canvas) {
						canvas.width = videoWidth;
						canvas.height = videoHeight;
					}
				}
			};
			drawPreview();
		}

		// Labels only populate once permission has been granted.
		cameras = await listCameras();
	}

	async function refreshCameras() {
		cameras = await listCameras();
		if (!cameras.length) {
			cameraError = 'No cameras found. Plug one in and press Refresh.';
			return;
		}
		// The remembered camera may have been unplugged while we were running.
		if (selectedDeviceId && !cameras.some((c) => c.deviceId === selectedDeviceId)) {
			await startCamera(null);
		}
	}

	function handleCameraChange() {
		// bind:value has already written the picked device into selectedDeviceId.
		startCamera(selectedDeviceId);
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
	async function captureFrame() {
		try {
			const frame = await canvasToBlob(canvas);
			frames = [...frames, frame];
			currentFrameIndex = -1;
			applyFilter();
		} catch (error) {
			console.error('Error capturing frame:', error);
			alert('Could not capture that frame. Please try again.');
		}
	}

	// Function to delete the selected frame, or the last one if none is selected
	function deleteCurrentFrame() {
		if (frames.length === 0) return;
		const target = currentFrameIndex === -1 ? frames.length - 1 : currentFrameIndex;
		frames = frames.filter((_, index) => index !== target);
		currentFrameIndex = -1;
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

	function drawFrame(frame: Blob): Promise<void> {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				if (context) {
					// With no live camera to size it, the canvas takes the frame's dimensions.
					if (!isPreviewActive && (canvas.width !== img.width || canvas.height !== img.height)) {
						canvas.width = img.width;
						canvas.height = img.height;
					}
					context.clearRect(0, 0, canvas.width, canvas.height);
					context.drawImage(img, 0, 0, canvas.width, canvas.height);
				}
				resolve();
			};
			img.onerror = () => resolve();
			img.src = urls.get(frame);
		});
	}

	// Function to play animation
	async function playAnimation(startIndex: number = 0) {
		if (isPlaying) return; // A second loop would fight the first over the canvas

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

		isPlaying = true;
		const frameDelay = 1000 / (fps || DEFAULT_FPS);

		try {
			for (let i = startIndex; i < frames.length; i++) {
				currentFrameIndex = i;
				await drawFrame(frames[i]);
				await new Promise((resolve) => setTimeout(resolve, frameDelay));
			}
		} finally {
			isPlaying = false;
			currentFrameIndex = -1;
		}
	}

	// Function to save animation
	async function saveAnimation() {
		const name = currentAnimationName.trim();
		if (!name) {
			alert('Please enter a name for the animation.');
			return;
		}
		if (frames.length === 0) {
			alert('Please capture at least one frame.');
			return;
		}

		try {
			project = project
				? await saveProject({ ...project, name, frames, fps })
				: await createProject({ name, frames, fps });
			alert('Animation saved successfully!');
		} catch (error) {
			console.error('Error saving animation:', error);
			alert('Error saving animation. Please try again.');
		}
	}

	let unsubscribeDeviceChange: (() => void) | null = null;

	onMount(() => {
		context = canvas.getContext('2d');
		selectedDeviceId = loadPreferredDeviceId();

		if (id) {
			loadProject(id);
		} else {
			startCamera(selectedDeviceId);
		}

		unsubscribeDeviceChange = onDeviceChange(refreshCameras);
	});

	onDestroy(() => {
		if (previewRequestId) cancelAnimationFrame(previewRequestId);
		unsubscribeDeviceChange?.();
		stopStream(stream);
		urls.revokeAll();
	});

	async function loadProject(projectId: string) {
		try {
			// Fall back to the name for links minted before ids existed.
			const found = (await getProject(projectId)) ?? (await getProjectByName(projectId));
			if (!found) {
				console.log('No animation found with ID:', projectId);
				alert('Animation not found');
				return;
			}

			project = found;
			frames = found.frames;
			fps = found.fps;
			currentAnimationName = found.name;

			if (frames.length > 0) {
				currentFrameIndex = 0;
				await drawFrame(frames[0]);
			}
		} catch (error) {
			console.error('Error loading animation:', error);
			alert('An error occurred while loading the animation');
		}
	}

	function newAnimation() {
		project = null;
		frames = [];
		currentAnimationName = '';
		currentFrameIndex = -1;
		if (context) {
			context.clearRect(0, 0, canvas.width, canvas.height);
		}
	}

	async function deleteAnimation() {
		if (!project) {
			alert('This animation has not been saved yet.');
			return;
		}

		const confirmDelete = confirm(`Are you sure you want to delete "${project.name}"?`);
		if (!confirmDelete) return;

		try {
			await deleteProject(project.id);
			goto(`${base}/`); // Navigate to the root route
		} catch (error) {
			console.error('Error deleting animation:', error);
			alert('Error deleting animation. Please try again.');
		}
	}

	async function selectFrame(index: number) {
		currentFrameIndex = index;
		if (isPreviewActive) {
			togglePreview();
		}
		if (frames[index]) {
			await drawFrame(frames[index]);
		}
	}

	function addNewFrame() {
		isPreviewActive = true;
		currentFrameIndex = -1;
		startCamera(selectedDeviceId);
	}

	function toggleEdit() {
		isEditing = !isEditing;
		if (isEditing) {
			editedName = currentAnimationName;
		}
	}

	async function saveEdit() {
		const name = editedName.trim();
		if (!name) {
			alert('Please enter a valid name for the animation.');
			return;
		}

		try {
			// Unsaved projects just take the new name; saved ones rename in one put.
			if (project) project = await renameProject(project.id, name);
			currentAnimationName = name;
			isEditing = false;
		} catch (error) {
			console.error('Error updating animation:', error);
			alert('Error updating animation. Please try again.');
		}
	}
</script>

{#if id !== null}
	{#if isEditing}
		<div class="edit-name">
			<input type="text" bind:value={editedName} placeholder="Enter new name" />
			<button on:click={saveEdit}>Save</button>
			<button on:click={toggleEdit}>Cancel</button>
		</div>
	{:else}
		<h1>
			{currentAnimationName}
			<button class="edit-button" on:click={toggleEdit}>Edit</button>
		</h1>
	{/if}
{/if}

<div class="container">
	{#if cameraError}
		<p class="camera-error" role="alert">{cameraError}</p>
	{/if}
	<div class="preview-and-controls">
		<div class="canvas-container" style="aspect-ratio: {aspectRatio}">
			<video bind:this={video} hidden autoplay playsinline>
				<track kind="captions" src="" label="Empty captions" />
			</video>
			<canvas bind:this={canvas}></canvas>
			{#if isPreviewActive}
				<div
					role="button"
					tabindex="0"
					class="capture-button"
					on:click={captureFrame}
					on:keydown={(e) => e.key === 'Enter' && captureFrame()}
				>
					<span class="gradient"></span>
				</div>
			{/if}
		</div>

		<div class="controls">
			<button on:click={captureFrame}>Add Frame</button>
			<div class="camera-picker">
				<label for="camera-select">Camera</label>
				<select id="camera-select" bind:value={selectedDeviceId} on:change={handleCameraChange}>
					{#if cameras.length === 0}
						<option value="">Default camera</option>
					{/if}
					{#each cameras as camera (camera.deviceId)}
						<option value={camera.deviceId}>{camera.label}</option>
					{/each}
				</select>
				<button on:click={refreshCameras}>Refresh</button>
			</div>
			<button on:click={togglePreview}>
				{isPreviewActive ? 'Stop Preview' : 'Start Preview'}
			</button>
			<button
				disabled={isPlaying}
				on:click={() => playAnimation(currentFrameIndex !== -1 ? currentFrameIndex : 0)}
			>
				Play Animation
			</button>
			<button on:click={deleteCurrentFrame}>Delete Current Frame</button>
			<select bind:value={filter}>
				<option value="none">None</option>
				<option value="grayscale">Grayscale</option>
				<option value="sepia">Sepia</option>
			</select>
			<input type="text" bind:value={currentAnimationName} placeholder="Animation name" />
			<button on:click={saveAnimation}>Save Animation</button>
			<button on:click={newAnimation}>New Animation</button>
			{#if project !== null}
				<button on:click={deleteAnimation} class="delete-button">Delete Animation</button>
			{/if}
		</div>
	</div>
	<div class="timeline">
		{#each frames as frame, index (frame)}
			<button
				class="frame"
				class:active={index === currentFrameIndex}
				on:click={() => selectFrame(index)}
			>
				<span class="frame-number">{index + 1}</span>
				<img src={urls.get(frame)} alt={`Frame ${index + 1}`} />
			</button>
		{/each}
		{#if frames.length > 0 && !isPreviewActive}
			<button class="add-frame" on:click={addNewFrame}>
				<span class="plus">+</span>
			</button>
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
	@media (min-width: 600px) {
		.preview-and-controls {
			display: grid;
			grid-template-columns: 1fr min-content;
		}
	}

	.canvas-container {
		width: 100%;
		aspect-ratio: 4 / 3; /* Changed from 16 / 9 for a larger vertical space */
		overflow: hidden;
		margin-bottom: 1rem;
		position: relative;
	}
	canvas {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.camera-picker {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.camera-picker label {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #666;
	}

	:global(.dark) .camera-picker label {
		color: #bbb;
	}

	.camera-picker select {
		max-width: 100%;
	}

	.camera-error {
		margin: 0 0 1rem;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: #fdecea;
		color: #b00020;
	}
	@media (min-width: 768px) {
		.controls {
			padding-left: 1rem;
		}
	}
	button {
		border-radius: 0.5rem;
		background: papayawhip;
	}

	button:hover,
	button:active {
		background: plum;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	button,
	select,
	input {
		min-width: 120px;
		padding: 0.75rem 0.5rem;
		font-size: 1rem;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
	}

	.timeline {
		display: flex;
		overflow-x: auto;
		gap: 0.5rem;
		padding: 1rem 0;
	}

	.frame {
		flex: 0 0 auto;
		border: 2px solid #ddd;
		border-radius: 4px;
		overflow: hidden;
		cursor: pointer;
		transition:
			border-color 0.3s,
			opacity 0.3s;
		position: relative;
		opacity: 0.5;
	}

	.frame:hover {
		border-color: #4caf50;
		opacity: 0.8;
	}

	.frame.active {
		border-color: #4caf50;
		opacity: 1;
	}

	.frame img {
		width: 100px;
		height: 70px;
		object-fit: cover;
	}

	@media (min-width: 768px) {
		.frame img {
			width: 150px;
			height: 100px;
		}
	}

	.frame-number {
		position: absolute;
		top: 5px;
		left: 5px;
		background-color: rgba(0, 0, 0, 0.6);
		color: white;
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 0.8rem;
	}

	.add-frame {
		flex: 0 0 auto;
		width: 200px;
		height: 150px;
		border: 2px dashed #ddd;
		border-radius: 4px;
		background: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.plus {
		font-size: 3rem;
		color: #4caf50;
	}

	.capture-button {
		appearance: none;
		position: absolute;
		/* background: gold; */
		right: 1rem;
		top: 50%;
		transform: translateY(-50%);
		display: block;
		min-width: none;
		height: 40px;
		width: 40px;
		border-radius: 50%;
		box-sizing: border-box;
		overflow: hidden;
		box-shadow: 0 0 3px 1px rgba(0, 0, 0, 0.6);
		/* background: rgb(4, 4, 189);
		background: radial-gradient(circle, rgba(4, 4, 189, 1) 13%, rgba(2, 0, 36, 1) 100%);
		transition: background 0.5s ease; */
	}

	@media (min-width: 768px) {
		.capture-button {
			width: 100px;
			height: 100px;
		}
	}

	.gradient {
		position: relative;
		display: block;
		border-radius: 50%;
		width: 100%;
		height: 100%;
		background-image: linear-gradient(to right, hsl(211, 100%, 50%), hsl(179, 100%, 30%));
		z-index: 1;
	}

	.gradient::before {
		position: absolute;
		content: '';
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		background-image: linear-gradient(to bottom, hsl(344, 100%, 50%), hsl(31, 100%, 40%));
		z-index: -1;
		transition: opacity 0.3s ease-out;
		opacity: 0;
	}
	.gradient:hover::before {
		opacity: 1;
	}

	h1 {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1rem;
		font-size: 2rem;
	}

	:global(.dark h1) {
		color: white;
		margin: 0 1rem;
	}

	.edit-name {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.edit-name input {
		font-size: 1.5rem;
		padding: 0.5rem;
	}

	.edit-button {
		font-size: 1rem;
		padding: 0.25rem 0.5rem;
		margin-left: 0.5rem;
		vertical-align: middle;
	}
</style>
