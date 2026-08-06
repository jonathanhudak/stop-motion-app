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
	import { clampFps, createPlayer, FPS_PRESETS, MAX_FPS, MIN_FPS } from '$lib/playback';

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
	let loopPlayback = true;
	let editedName = '';

	let onionEnabled = true;
	let onionOpacity = 0.35;
	let onionImage: HTMLImageElement | null = null;

	const urls = createObjectUrlCache();
	$: urls.prune(frames);

	// Keep the ghost pointed at the most recent frame.
	$: loadOnionImage(frames[frames.length - 1]);

	function loadOnionImage(frame: Blob | undefined) {
		if (!frame) {
			onionImage = null;
			return;
		}
		const img = new Image();
		img.onload = () => {
			onionImage = img;
		};
		img.src = urls.get(frame);
	}

	const player = createPlayer();

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

	function canvasFilter(): string {
		return filter === 'none' ? 'none' : `${filter}(100%)`;
	}

	function drawPreview() {
		if (isPreviewActive && context && video) {
			context.globalAlpha = 1;
			context.filter = canvasFilter();
			context.drawImage(video, 0, 0, canvas.width, canvas.height);

			// Onion skin: the frame you shot last, ghosted over the live view, so
			// you can line up the next move instead of eyeballing it.
			if (onionEnabled && onionImage) {
				context.globalAlpha = onionOpacity;
				context.drawImage(onionImage, 0, 0, canvas.width, canvas.height);
				context.globalAlpha = 1;
			}

			previewRequestId = requestAnimationFrame(drawPreview);
		}
	}

	/** The ghost is only ever drawn on screen, never into a captured frame. */
	async function captureFrame() {
		if (!video || !canvas.width) return;

		try {
			const shot = document.createElement('canvas');
			shot.width = canvas.width;
			shot.height = canvas.height;
			const shotContext = shot.getContext('2d');
			if (!shotContext) throw new Error('Could not get a canvas context');
			shotContext.filter = canvasFilter();
			shotContext.drawImage(video, 0, 0, shot.width, shot.height);

			const frame = await canvasToBlob(shot);
			frames = [...frames, frame];
			currentFrameIndex = -1;
		} catch (error) {
			console.error('Error capturing frame:', error);
			cameraError = 'Could not capture that frame. Please try again.';
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
					context.globalAlpha = 1;
					context.filter = 'none'; // Saved frames already have their filter baked in.
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

	async function playAnimation(startIndex: number = 0) {
		if (frames.length === 0) return;

		if (isPreviewActive) {
			isPreviewActive = false;
			if (previewRequestId) {
				cancelAnimationFrame(previewRequestId);
			}
		}

		isPlaying = true;
		await player.play({
			frameCount: frames.length,
			fps,
			loop: loopPlayback,
			startIndex,
			onFrame: async (index) => {
				currentFrameIndex = index;
				await drawFrame(frames[index]);
			},
			// A restart (fps change) begins before the old loop unwinds, so trust
			// the player rather than blindly clearing the flag.
			onEnd: () => {
				isPlaying = player.playing;
			}
		});
	}

	function stopPlayback() {
		player.stop();
	}

	function stepFrame(delta: number) {
		if (frames.length === 0) return;
		const from = currentFrameIndex === -1 ? frames.length : currentFrameIndex;
		const next = Math.min(frames.length - 1, Math.max(0, from + delta));
		selectFrame(next);
	}

	/** Shooting needs both hands on the puppet, so the useful actions get keys. */
	function handleKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		// Never steal keys from a text field or the name editor.
		const target = event.target as HTMLElement | null;
		const tag = target?.tagName;
		if (isEditing || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

		switch (event.key) {
			case ' ':
				event.preventDefault(); // Space would scroll, or re-trigger a focused button.
				if (isPreviewActive) captureFrame();
				else togglePreview();
				break;
			case 'ArrowLeft':
				event.preventDefault();
				stepFrame(-1);
				break;
			case 'ArrowRight':
				event.preventDefault();
				stepFrame(1);
				break;
			case 'Delete':
			case 'Backspace':
				event.preventDefault();
				deleteCurrentFrame();
				break;
			case 'p':
			case 'P':
				if (isPlaying) stopPlayback();
				else playAnimation(currentFrameIndex === -1 ? 0 : currentFrameIndex);
				break;
			case 'o':
			case 'O':
				onionEnabled = !onionEnabled;
				break;
		}
	}

	function setFps(next: number) {
		fps = clampFps(next);
		// Restart so the change is audible immediately rather than after the loop ends.
		if (isPlaying) {
			const resumeAt = currentFrameIndex === -1 ? 0 : currentFrameIndex;
			player.stop();
			playAnimation(resumeAt);
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
		player.stop();
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

<svelte:window on:keydown={handleKeydown} />

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
			{#if isPlaying}
				<button on:click={stopPlayback}>Stop Playback</button>
			{:else}
				<button
					disabled={frames.length === 0}
					on:click={() => playAnimation(currentFrameIndex !== -1 ? currentFrameIndex : 0)}
				>
					Play Animation
				</button>
			{/if}

			<div class="onion">
				<label class="checkbox">
					<input type="checkbox" bind:checked={onionEnabled} />
					Onion skin
				</label>
				<input
					aria-label="Onion skin opacity"
					type="range"
					min="0.1"
					max="0.9"
					step="0.05"
					disabled={!onionEnabled}
					bind:value={onionOpacity}
				/>
			</div>

			<div class="fps">
				<label for="fps-slider">Frame rate: {fps} fps</label>
				<input
					id="fps-slider"
					type="range"
					min={MIN_FPS}
					max={MAX_FPS}
					step="1"
					value={fps}
					on:input={(e) => setFps(Number(e.currentTarget.value))}
				/>
				<div class="fps-presets">
					{#each FPS_PRESETS as preset (preset)}
						<button class="preset" class:active={fps === preset} on:click={() => setFps(preset)}>
							{preset}
						</button>
					{/each}
				</div>
				<label class="checkbox">
					<input type="checkbox" bind:checked={loopPlayback} />
					Loop
				</label>
			</div>
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
	<p class="shortcuts">
		<kbd>Space</kbd> capture · <kbd>←</kbd><kbd>→</kbd> step frames ·
		<kbd>Delete</kbd> remove frame · <kbd>P</kbd> play/stop · <kbd>O</kbd> onion skin
	</p>

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

	.onion,
	.fps {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.onion input[type='range'] {
		min-width: 0;
		width: 100%;
		padding: 0;
	}

	.shortcuts {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		color: #666;
	}

	:global(.dark) .shortcuts {
		color: #bbb;
	}

	kbd {
		display: inline-block;
		padding: 0.1rem 0.35rem;
		border: 1px solid #ccc;
		border-bottom-width: 2px;
		border-radius: 0.25rem;
		font-family: inherit;
		font-size: 0.75rem;
	}

	.fps > label {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #666;
	}

	:global(.dark) .fps > label {
		color: #bbb;
	}

	.fps input[type='range'] {
		min-width: 0;
		width: 100%;
		padding: 0;
	}

	.fps-presets {
		display: flex;
		gap: 0.25rem;
	}

	.preset {
		flex: 1;
		min-width: 0;
		padding: 0.4rem 0;
		font-size: 0.9rem;
	}

	.preset.active {
		background: plum;
		font-weight: 600;
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
	}

	.checkbox input {
		min-width: 0;
		width: auto;
		padding: 0;
	}

	:global(.dark) .checkbox {
		color: #eee;
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
