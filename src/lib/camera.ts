/**
 * Camera selection and stream lifecycle.
 *
 * Only UVC devices are visible to getUserMedia: plain webcams and HDMI capture
 * cards show up, a DSLR over USB does not unless it exposes a webcam mode or
 * vendor software publishes a virtual camera.
 */

const STORAGE_KEY = 'stop-motion:camera-device-id';

export interface CameraDevice {
	deviceId: string;
	label: string;
}

export interface StreamInfo {
	deviceId: string | null;
	label: string;
	width: number;
	height: number;
}

/** Higher than the browser default, which tends to hand back 640x480. */
const RESOLUTION: MediaTrackConstraints = {
	width: { ideal: 1920 },
	height: { ideal: 1080 }
};

export function loadPreferredDeviceId(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null; // Private mode, or storage disabled.
	}
}

export function savePreferredDeviceId(deviceId: string | null): void {
	try {
		if (deviceId) localStorage.setItem(STORAGE_KEY, deviceId);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Not being able to remember the camera is not worth failing over.
	}
}

/**
 * Labels are empty strings until the user has granted camera permission at
 * least once, so call this after a successful openCamera().
 */
export async function listCameras(): Promise<CameraDevice[]> {
	if (!navigator.mediaDevices?.enumerateDevices) return [];
	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices
		.filter((device) => device.kind === 'videoinput')
		.map((device, index) => ({
			deviceId: device.deviceId,
			label: device.label || `Camera ${index + 1}`
		}));
}

export async function openCamera(deviceId?: string | null): Promise<MediaStream> {
	if (!navigator.mediaDevices?.getUserMedia) {
		throw new Error('This browser cannot access cameras.');
	}

	const video: MediaTrackConstraints = deviceId
		? { ...RESOLUTION, deviceId: { exact: deviceId } }
		: RESOLUTION;

	try {
		return await navigator.mediaDevices.getUserMedia({ video });
	} catch (error) {
		const name = error instanceof DOMException ? error.name : '';
		// The remembered camera was unplugged or can't meet the constraint:
		// fall back to whatever camera is available rather than failing outright.
		if (deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
			return navigator.mediaDevices.getUserMedia({ video: RESOLUTION });
		}
		throw error;
	}
}

/** Releases the camera. Without this the device light stays on and some webcams refuse to reopen. */
export function stopStream(stream: MediaStream | null | undefined): void {
	stream?.getTracks().forEach((track) => track.stop());
}

export function describeStream(stream: MediaStream, requestedDeviceId?: string | null): StreamInfo {
	const track = stream.getVideoTracks()[0];
	const settings = track?.getSettings() ?? {};
	return {
		// Safari omits deviceId from getSettings(). Without this fallback the
		// picker would snap back to "Default camera" after every selection, and
		// the remembered device would be cleared.
		deviceId: settings.deviceId ?? requestedDeviceId ?? null,
		label: track?.label ?? '',
		width: settings.width ?? 0,
		height: settings.height ?? 0
	};
}

/** Subscribes to plug/unplug events. Returns an unsubscribe function. */
export function onDeviceChange(handler: () => void): () => void {
	const target = navigator.mediaDevices;
	if (!target?.addEventListener) return () => {};
	target.addEventListener('devicechange', handler);
	return () => target.removeEventListener('devicechange', handler);
}

export function cameraErrorMessage(error: unknown): string {
	const name = error instanceof DOMException ? error.name : '';
	switch (name) {
		case 'NotAllowedError':
		case 'SecurityError':
			return 'Camera access was blocked. Allow it in your browser settings, then try again.';
		case 'NotFoundError':
		case 'OverconstrainedError':
			return 'No camera found. Plug one in and press Refresh.';
		case 'NotReadableError':
			return 'That camera is in use by another app. Close it and try again.';
		default:
			return error instanceof Error ? error.message : 'Could not start the camera.';
	}
}
