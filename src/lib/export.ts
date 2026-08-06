/**
 * Turning a project's frames into a file you can share.
 *
 * WebM goes through MediaRecorder over a canvas capture stream, driven one
 * frame at a time so playback speed matches the project's fps. GIF is encoded
 * with gifenc, which quantises each frame to a 256-colour palette.
 */

import { applyPalette, GIFEncoder, quantize } from 'gifenc';

export type ProgressHandler = (done: number, total: number) => void;

/** GIFs are palette-based and grow fast, so cap the long edge. */
const GIF_MAX_WIDTH = 800;

const WEBM_TYPES = [
	'video/webm;codecs=vp9',
	'video/webm;codecs=vp8',
	'video/webm',
	'video/mp4' // Safari records mp4 rather than webm.
];

export function pickVideoType(): string | null {
	if (typeof MediaRecorder === 'undefined') return null;
	return WEBM_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function videoExportSupported(): boolean {
	return (
		pickVideoType() !== null && typeof HTMLCanvasElement.prototype.captureStream === 'function'
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function decode(frame: Blob): Promise<ImageBitmap> {
	return createImageBitmap(frame);
}

/** Dimensions come from the first frame; every frame is drawn to that size. */
async function firstFrameSize(frames: Blob[]): Promise<{ width: number; height: number }> {
	const bitmap = await decode(frames[0]);
	const size = { width: bitmap.width, height: bitmap.height };
	bitmap.close();
	return size;
}

interface CanvasCaptureTrack extends MediaStreamTrack {
	requestFrame?: () => void;
}

/** A 1/255 change to a single corner pixel: enough to count as a new frame. */
function nudgeLastPixel(context: CanvasRenderingContext2D, width: number, height: number): void {
	const x = width - 1;
	const y = height - 1;
	const pixel = context.getImageData(x, y, 1, 1);
	pixel.data[0] ^= 1;
	context.putImageData(pixel, x, y);
}

export async function exportVideo(
	frames: Blob[],
	fps: number,
	onProgress?: ProgressHandler
): Promise<{ blob: Blob; extension: string }> {
	if (frames.length === 0) throw new Error('There are no frames to export.');

	const mimeType = pickVideoType();
	if (!mimeType) throw new Error('This browser cannot record video.');

	const { width, height } = await firstFrameSize(frames);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Could not get a canvas context.');

	// captureStream(0) means "only the frames I ask for", which keeps the output
	// in step with the frames rather than with the browser's paint timing.
	const stream = canvas.captureStream(0);
	const track = stream.getVideoTracks()[0] as CanvasCaptureTrack;
	const recorder = new MediaRecorder(stream, { mimeType });
	const chunks: BlobPart[] = [];

	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) chunks.push(event.data);
	};

	const finished = new Promise<Blob>((resolve, reject) => {
		recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
		recorder.onerror = () => reject(new Error('Recording failed.'));
	});

	const frameDuration = 1000 / fps;
	recorder.start();

	try {
		for (let i = 0; i < frames.length; i++) {
			const bitmap = await decode(frames[i]);
			context.clearRect(0, 0, width, height);
			context.drawImage(bitmap, 0, 0, width, height);
			bitmap.close();

			track.requestFrame?.();
			onProgress?.(i + 1, frames.length);
			// Real time has to pass: the recorder timestamps frames as they arrive.
			await sleep(frameDuration);
		}

		// Hold the final frame for its share of the running time. Idle time does
		// not extend a WebM (only frame timestamps do), and Chromium drops a
		// requested frame whose pixels are unchanged, so flip the low bit of one
		// corner pixel to make the tail frame byte-different but indistinguishable.
		nudgeLastPixel(context, width, height);
		track.requestFrame?.();
		await sleep(frameDuration);
	} finally {
		recorder.stop();
		track.stop();
	}

	const blob = await finished;
	return { blob, extension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

export async function exportGif(
	frames: Blob[],
	fps: number,
	onProgress?: ProgressHandler
): Promise<{ blob: Blob; extension: string }> {
	if (frames.length === 0) throw new Error('There are no frames to export.');

	const source = await firstFrameSize(frames);
	const scale = Math.min(1, GIF_MAX_WIDTH / source.width);
	const width = Math.max(1, Math.round(source.width * scale));
	const height = Math.max(1, Math.round(source.height * scale));

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) throw new Error('Could not get a canvas context.');

	const encoder = GIFEncoder();
	const delay = Math.round(1000 / fps);

	for (let i = 0; i < frames.length; i++) {
		const bitmap = await decode(frames[i]);
		context.clearRect(0, 0, width, height);
		context.drawImage(bitmap, 0, 0, width, height);
		bitmap.close();

		const { data } = context.getImageData(0, 0, width, height);
		const palette = quantize(data, 256);
		const index = applyPalette(data, palette);
		encoder.writeFrame(index, width, height, { palette, delay });

		onProgress?.(i + 1, frames.length);
		// Yield so a long encode does not freeze the page.
		await sleep(0);
	}

	encoder.finish();
	return { blob: new Blob([encoder.bytes()], { type: 'image/gif' }), extension: 'gif' };
}

export function exportFilename(projectName: string, extension: string): string {
	const base =
		projectName
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60) || 'animation';
	return `${base}.${extension}`;
}

export function toFile(blob: Blob, filename: string): File {
	return new File([blob], filename, { type: blob.type });
}

/**
 * Whether the OS share sheet will take this file. Android Chrome and iOS Safari
 * say yes; desktop browsers mostly say no, which is why download stays the
 * fallback.
 */
export function canShareFile(file: File): boolean {
	if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
	try {
		return navigator.canShare?.({ files: [file] }) ?? false;
	} catch {
		return false;
	}
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';

/**
 * Must be called straight from a click. The share sheet needs a fresh user
 * gesture, and encoding takes long enough to lose the one that started it --
 * hence sharing is a separate button rather than automatic after export.
 */
export async function shareFile(file: File, title: string): Promise<ShareResult> {
	if (!canShareFile(file)) return 'unsupported';
	try {
		await navigator.share({ files: [file], title });
		return 'shared';
	} catch (error) {
		// Dismissing the sheet rejects with AbortError; that is not a failure.
		if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
		throw error;
	}
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	// Revoking immediately can cancel the download in some browsers.
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
