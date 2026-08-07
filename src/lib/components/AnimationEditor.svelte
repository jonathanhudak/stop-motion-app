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
	import { clampFps, createPlayer } from '$lib/playback';
	import {
		canShareFile,
		downloadBlob,
		exportFilename,
		exportGif,
		exportVideo,
		shareFile,
		toFile,
		videoExportSupported
	} from '$lib/export';
	import { toast } from '$lib/toast';
	import CameraPicker from './CameraPicker.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import ExportPanel from './ExportPanel.svelte';
	import FrameTimeline from './FrameTimeline.svelte';
	import OnionSkinControls from './OnionSkinControls.svelte';
	import PlaybackControls from './PlaybackControls.svelte';
	import ProjectTitle from './ProjectTitle.svelte';

	/** Project id, or a legacy name-based id from an older link. */
	export let id: string | null = null;

	let video: HTMLVideoElement;
	let canvas: HTMLCanvasElement;
	let context: CanvasRenderingContext2D | null;

	// Camera
	let stream: MediaStream | null = null;
	let cameras: CameraDevice[] = [];
	let selectedDeviceId: string | null = null;
	let cameraError: string | null = null;
	let aspectRatio = 4 / 3;
	let unsubscribeDeviceChange: (() => void) | null = null;

	// Project
	let project: Project | null = null;
	let frames: Blob[] = [];
	let fps: number = DEFAULT_FPS;
	let projectName = '';
	let currentFrameIndex = -1;

	// Shooting
	let isPreviewActive = !id;
	let previewRequestId: number | null = null;
	let filter = 'none';
	let onionEnabled = true;
	let onionOpacity = 0.35;
	let onionImage: HTMLImageElement | null = null;

	// Playback
	const player = createPlayer();
	let isPlaying = false;
	let loopPlayback = true;

	// Export
	let exportStatus: string | null = null;
	let exportedFile: File | null = null;
	const canExportVideo = typeof window !== 'undefined' && videoExportSupported();
	$: canShareExport = exportedFile !== null && canShareFile(exportedFile);

	let confirmDeleteOpen = false;

	const urls = createObjectUrlCache();
	$: urls.prune(frames);
	$: loadOnionImage(frames[frames.length - 1]);

	function urlFor(frame: Blob): string {
		return urls.get(frame);
	}

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

	// --- Camera -------------------------------------------------------------

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
		const info = describeStream(stream, deviceId);
		selectedDeviceId = info.deviceId;
		savePreferredDeviceId(info.deviceId);
		applyDimensions(info.width, info.height);

		if (video) {
			video.srcObject = stream;
			video.play().catch(() => {}); // Autoplay rejection is not fatal; the draw loop still runs.
			video.onloadedmetadata = () => applyDimensions(video.videoWidth, video.videoHeight);
			isPreviewActive = true;
			drawPreview();
		}

		// Labels only populate once permission has been granted.
		cameras = await listCameras();
	}

	function applyDimensions(width: number, height: number) {
		if (!width || !height) return;
		aspectRatio = width / height;
		if (canvas) {
			canvas.width = width;
			canvas.height = height;
		}
	}

	async function refreshCameras() {
		// Without permission the device list is empty or unlabelled, so open a
		// camera first. This is also what makes a just-plugged-in camera appear.
		if (!stream) await startCamera(selectedDeviceId);

		cameras = await listCameras();
		if (cameras.length === 0) {
			cameraError = 'No cameras found. Plug one in and press Refresh.';
			return;
		}

		// The remembered camera may have been unplugged while we were running.
		if (selectedDeviceId && !cameras.some((camera) => camera.deviceId === selectedDeviceId)) {
			await startCamera(null);
		} else {
			toast.info(`Found ${cameras.length} camera${cameras.length === 1 ? '' : 's'}.`);
		}
	}

	// --- Drawing ------------------------------------------------------------

	function canvasFilter(): string {
		return filter === 'none' ? 'none' : `${filter}(100%)`;
	}

	function drawPreview() {
		if (isPreviewActive && context && video) {
			context.globalAlpha = 1;
			context.filter = canvasFilter();
			context.drawImage(video, 0, 0, canvas.width, canvas.height);

			if (onionEnabled && onionImage) {
				context.globalAlpha = onionOpacity;
				context.drawImage(onionImage, 0, 0, canvas.width, canvas.height);
				context.globalAlpha = 1;
			}

			previewRequestId = requestAnimationFrame(drawPreview);
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
						aspectRatio = img.width / img.height;
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

	function togglePreview() {
		isPreviewActive = !isPreviewActive;
		if (isPreviewActive) {
			if (!stream) startCamera(selectedDeviceId);
			else drawPreview();
		} else if (previewRequestId) {
			cancelAnimationFrame(previewRequestId);
		}
	}

	// --- Frames -------------------------------------------------------------

	/** The onion-skin ghost is only ever drawn on screen, never into a frame. */
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

			frames = [...frames, await canvasToBlob(shot)];
			currentFrameIndex = -1;
		} catch (error) {
			console.error('Error capturing frame:', error);
			toast.error('Could not capture that frame.');
		}
	}

	function removeFrame(index: number) {
		const removed = frames[index];
		if (!removed) return;

		frames = frames.filter((_, i) => i !== index);
		currentFrameIndex = -1;

		toast.info(`Deleted frame ${index + 1}.`, {
			label: 'Undo',
			run: () => {
				frames = [...frames.slice(0, index), removed, ...frames.slice(index)];
			}
		});
	}

	function deleteSelectedFrame() {
		if (frames.length === 0) return;
		removeFrame(currentFrameIndex === -1 ? frames.length - 1 : currentFrameIndex);
	}

	async function selectFrame(index: number) {
		currentFrameIndex = index;
		if (isPreviewActive) togglePreview();
		if (frames[index]) await drawFrame(frames[index]);
	}

	function stepFrame(delta: number) {
		if (frames.length === 0) return;
		const from = currentFrameIndex === -1 ? frames.length : currentFrameIndex;
		selectFrame(Math.min(frames.length - 1, Math.max(0, from + delta)));
	}

	function resumeShooting() {
		currentFrameIndex = -1;
		if (!isPreviewActive) togglePreview();
	}

	// --- Playback -----------------------------------------------------------

	async function playAnimation(startIndex = 0) {
		if (frames.length === 0) return;

		if (isPreviewActive) {
			isPreviewActive = false;
			if (previewRequestId) cancelAnimationFrame(previewRequestId);
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

	function setFps(next: number) {
		fps = clampFps(next);
		// Restart so the change takes effect now rather than after the loop ends.
		if (isPlaying) {
			const resumeAt = currentFrameIndex === -1 ? 0 : currentFrameIndex;
			player.stop();
			playAnimation(resumeAt);
		}
	}

	// --- Storage ------------------------------------------------------------

	async function loadProject(projectId: string) {
		try {
			// Fall back to the name for links minted before ids existed.
			const found = (await getProject(projectId)) ?? (await getProjectByName(projectId));
			if (!found) {
				toast.error('That animation could not be found.');
				return;
			}

			project = found;
			frames = found.frames;
			fps = found.fps;
			projectName = found.name;

			if (frames.length > 0) {
				currentFrameIndex = 0;
				await drawFrame(frames[0]);
			}
		} catch (error) {
			console.error('Error loading animation:', error);
			toast.error('Could not load that animation.');
		}
	}

	async function saveAnimation() {
		const name = projectName.trim();
		if (!name) {
			toast.error('Give the animation a name first.');
			return;
		}
		if (frames.length === 0) {
			toast.error('Capture at least one frame first.');
			return;
		}

		try {
			project = project
				? await saveProject({ ...project, name, frames, fps })
				: await createProject({ name, frames, fps });
			toast.success(`Saved “${name}”.`);
		} catch (error) {
			console.error('Error saving animation:', error);
			toast.error('Could not save. Please try again.');
		}
	}

	async function renameCurrent(name: string) {
		projectName = name;
		if (!project) return;

		try {
			project = await renameProject(project.id, name);
			toast.success(`Renamed to “${name}”.`);
		} catch (error) {
			console.error('Error renaming animation:', error);
			toast.error('Could not rename. Please try again.');
		}
	}

	async function confirmDelete() {
		confirmDeleteOpen = false;
		if (!project) return;

		try {
			await deleteProject(project.id);
			toast.success(`Deleted “${project.name}”.`);
			goto(`${base}/`);
		} catch (error) {
			console.error('Error deleting animation:', error);
			toast.error('Could not delete. Please try again.');
		}
	}

	function newAnimation() {
		player.stop();
		project = null;
		frames = [];
		projectName = '';
		currentFrameIndex = -1;
		exportedFile = null;
		context?.clearRect(0, 0, canvas.width, canvas.height);
		resumeShooting();
	}

	// --- Export -------------------------------------------------------------

	async function runExport(kind: 'video' | 'gif') {
		if (frames.length === 0 || exportStatus) return;

		player.stop();
		const label = kind === 'gif' ? 'GIF' : 'video';
		exportStatus = `Encoding ${label}… 0/${frames.length}`;
		exportedFile = null;

		try {
			const onProgress = (done: number, total: number) => {
				exportStatus = `Encoding ${label}… ${done}/${total}`;
			};
			const { blob, extension } =
				kind === 'gif'
					? await exportGif(frames, fps, onProgress)
					: await exportVideo(frames, fps, onProgress);

			const filename = exportFilename(projectName || 'animation', extension);
			const file = toFile(blob, filename);
			exportStatus = null;
			exportedFile = file;

			if (canShareFile(file)) {
				// The share sheet needs a fresh gesture, so offer a button rather
				// than firing it here, seconds after the click that started encoding.
				exportStatus = `${filename} ready.`;
				toast.success(`${label} ready to share.`);
			} else {
				downloadBlob(blob, filename);
				exportStatus = `Saved ${filename}.`;
				toast.success(`Saved ${filename}.`);
			}
		} catch (error) {
			console.error(`Error exporting ${label}:`, error);
			exportStatus = null;
			toast.error(error instanceof Error ? error.message : `Could not export the ${label}.`);
		}
	}

	async function shareExport() {
		if (!exportedFile) return;

		try {
			const result = await shareFile(exportedFile, projectName || 'Stop motion');
			if (result === 'unsupported') {
				downloadBlob(exportedFile, exportedFile.name);
				toast.info(`Sharing is not available here, so ${exportedFile.name} was saved.`);
			} else if (result === 'shared') {
				toast.success(`Shared ${exportedFile.name}.`);
			}
		} catch (error) {
			console.error('Error sharing export:', error);
			toast.error('Could not open the share sheet. Save the file instead.');
		}
	}

	function downloadExport() {
		if (!exportedFile) return;
		downloadBlob(exportedFile, exportedFile.name);
		toast.success(`Saved ${exportedFile.name}.`);
	}

	// --- Keyboard -----------------------------------------------------------

	/** Shooting needs both hands on the puppet, so the useful actions get keys. */
	function handleKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (confirmDeleteOpen) return;

		const tag = (event.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

		switch (event.key) {
			case ' ':
				event.preventDefault(); // Space would scroll, or re-trigger a focused button.
				if (isPreviewActive) captureFrame();
				else resumeShooting();
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
				deleteSelectedFrame();
				break;
			case 'p':
			case 'P':
				if (isPlaying) player.stop();
				else playAnimation(currentFrameIndex === -1 ? 0 : currentFrameIndex);
				break;
			case 'o':
			case 'O':
				onionEnabled = !onionEnabled;
				break;
		}
	}

	// --- Lifecycle ----------------------------------------------------------

	onMount(() => {
		context = canvas.getContext('2d');
		selectedDeviceId = loadPreferredDeviceId();

		if (id) loadProject(id);
		else startCamera(selectedDeviceId);

		unsubscribeDeviceChange = onDeviceChange(refreshCameras);
	});

	onDestroy(() => {
		player.stop();
		if (previewRequestId) cancelAnimationFrame(previewRequestId);
		unsubscribeDeviceChange?.();
		stopStream(stream);
		urls.revokeAll();
	});
</script>

<svelte:window on:keydown={handleKeydown} />

{#if id !== null}
	<ProjectTitle
		name={projectName}
		frameCount={frames.length}
		{fps}
		on:rename={(event) => renameCurrent(event.detail)}
	/>
{/if}

<div class="editor">
	<section class="stage">
		{#if cameraError}
			<p class="banner" role="alert">{cameraError}</p>
		{/if}

		<div class="viewport" style="aspect-ratio: {aspectRatio}">
			<video bind:this={video} hidden autoplay playsinline>
				<track kind="captions" src="" label="Empty captions" />
			</video>
			<canvas bind:this={canvas}></canvas>

			{#if !isPreviewActive && !isPlaying}
				<button class="resume" on:click={resumeShooting}>Back to live view</button>
			{/if}
		</div>

		<div class="primary-actions">
			<button class="primary capture" disabled={!isPreviewActive} on:click={captureFrame}>
				Capture <kbd>Space</kbd>
			</button>
			<button on:click={togglePreview}>
				{isPreviewActive ? 'Pause live view' : 'Resume live view'}
			</button>
			<button class="primary save" on:click={saveAnimation}>Save animation</button>
		</div>

		<p class="shortcuts">
			<kbd>Space</kbd> capture · <kbd>←</kbd><kbd>→</kbd> step · <kbd>Delete</kbd> remove ·
			<kbd>P</kbd> play · <kbd>O</kbd> onion skin
		</p>

		<!-- Directly under the stage: the frames you just shot are the thing you
		     look at most, and they must not be a five-panel scroll away on a phone. -->
		<FrameTimeline
			{frames}
			activeIndex={currentFrameIndex}
			showAddButton={frames.length > 0 && !isPreviewActive}
			{urlFor}
			on:select={(event) => selectFrame(event.detail)}
			on:remove={(event) => removeFrame(event.detail)}
			on:add={resumeShooting}
		/>
	</section>

	<aside class="panels">
		<div class="panel">
			<label class="field-label" for="animation-name">Name</label>
			<input
				id="animation-name"
				type="text"
				bind:value={projectName}
				placeholder="Untitled animation"
			/>
		</div>

		<div class="panel">
			<CameraPicker
				{cameras}
				bind:selectedDeviceId
				on:select={(event) => startCamera(event.detail)}
				on:refresh={refreshCameras}
			/>
		</div>

		<div class="panel">
			<OnionSkinControls bind:enabled={onionEnabled} bind:opacity={onionOpacity} />
			<label class="field-label" for="filter-select">Filter</label>
			<select id="filter-select" bind:value={filter}>
				<option value="none">None</option>
				<option value="grayscale">Grayscale</option>
				<option value="sepia">Sepia</option>
			</select>
		</div>

		<div class="panel">
			<PlaybackControls
				{fps}
				bind:loop={loopPlayback}
				playing={isPlaying}
				canPlay={frames.length > 0}
				on:play={() => playAnimation(currentFrameIndex === -1 ? 0 : currentFrameIndex)}
				on:stop={() => player.stop()}
				on:fps={(event) => setFps(event.detail)}
			/>
		</div>

		<div class="panel">
			<ExportPanel
				{canExportVideo}
				canShare={canShareExport}
				busy={exportStatus !== null && exportedFile === null}
				status={exportStatus}
				hasFrames={frames.length > 0}
				exportedName={exportedFile?.name ?? null}
				on:video={() => runExport('video')}
				on:gif={() => runExport('gif')}
				on:share={shareExport}
				on:download={downloadExport}
			/>
		</div>

		<div class="panel row">
			<button on:click={newAnimation}>New</button>
			{#if project}
				<button class="danger" on:click={() => (confirmDeleteOpen = true)}>Delete animation</button>
			{/if}
		</div>
	</aside>
</div>

<ConfirmDialog
	open={confirmDeleteOpen}
	title="Delete this animation?"
	message={project ? `“${project.name}” and its ${frames.length} frames will be removed.` : ''}
	confirmLabel="Delete"
	on:confirm={confirmDelete}
	on:cancel={() => (confirmDeleteOpen = false)}
/>

<style>
	.editor {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1rem;
	}

	.editor {
		display: grid;
		gap: 1rem;
		padding-top: 1rem;
	}

	/* Controls sit beside the viewport once there is room for them. */
	@media (min-width: 860px) {
		.editor {
			grid-template-columns: minmax(0, 1fr) 19rem;
			align-items: start;
		}
	}

	.viewport {
		position: relative;
		width: 100%;
		overflow: hidden;
		border-radius: var(--radius);
		background: #000;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.resume {
		position: absolute;
		left: 50%;
		bottom: 1rem;
		transform: translateX(-50%);
	}

	.primary-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.capture {
		flex: 1 1 12rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 1.05rem;
	}

	.capture kbd {
		border-color: rgba(255, 255, 255, 0.5);
		background: rgba(255, 255, 255, 0.15);
		color: inherit;
	}

	.save {
		flex: 0 1 auto;
	}

	/* Hidden on phones, which have no keys to press. */
	.shortcuts {
		display: none;
		margin: 0.75rem 0 0;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	@media (min-width: 700px) {
		.shortcuts {
			display: block;
		}
	}

	.panels {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}

	.panel.row {
		flex-direction: row;
		gap: 0.5rem;
	}

	.panel.row button {
		flex: 1;
	}

	.field-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.banner {
		margin: 0 0 0.75rem;
		padding: 0.7rem 0.85rem;
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 0.9rem;
	}
</style>
