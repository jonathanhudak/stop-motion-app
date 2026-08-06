// gifenc ships no types. Declares only the surface src/lib/export.ts uses.
declare module 'gifenc' {
	export interface WriteFrameOptions {
		palette?: number[][];
		/** Hundredths of a second are what the GIF format stores; gifenc takes ms. */
		delay?: number;
		transparent?: boolean;
		repeat?: number;
		first?: boolean;
	}

	export interface Encoder {
		writeFrame(index: Uint8Array, width: number, height: number, options?: WriteFrameOptions): void;
		finish(): void;
		// Explicitly ArrayBuffer-backed so the result is a valid BlobPart.
		bytes(): Uint8Array<ArrayBuffer>;
		bytesView(): Uint8Array<ArrayBuffer>;
		reset(): void;
	}

	export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): Encoder;

	export function quantize(
		rgba: Uint8Array | Uint8ClampedArray,
		maxColors: number,
		options?: { format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean | number }
	): number[][];

	export function applyPalette(
		rgba: Uint8Array | Uint8ClampedArray,
		palette: number[][],
		format?: 'rgb565' | 'rgb444' | 'rgba4444'
	): Uint8Array;
}
