/**
 * Frame playback with a real frame rate and a stop button.
 *
 * The previous version chained setTimeout(100) per frame with no way to
 * interrupt it, so playback was pinned at 10fps and a second Play started a
 * competing loop. This schedules against a running deadline instead, so slow
 * frame draws eat into the wait rather than adding to it.
 */

export const FPS_PRESETS = [8, 12, 15, 24] as const;
export const MIN_FPS = 1;
export const MAX_FPS = 30;

export function clampFps(fps: number): number {
	if (!Number.isFinite(fps)) return 12;
	return Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(fps)));
}

export interface PlayOptions {
	/** Number of frames to step through. */
	frameCount: number;
	fps: number;
	loop?: boolean;
	startIndex?: number;
	/** Draws the frame. Awaited, so decode time is accounted for. */
	onFrame: (index: number) => void | Promise<void>;
	/** Runs once playback ends, whether it finished or was stopped. */
	onEnd?: () => void;
}

export interface Player {
	play(options: PlayOptions): Promise<void>;
	stop(): void;
	readonly playing: boolean;
}

export function createPlayer(): Player {
	// Each run claims a generation. A shared stopped flag is not enough: a new
	// play() would clear it and the loop it just replaced would carry on drawing,
	// so changing fps mid-playback left two loops fighting over the canvas.
	let generation = 0;
	let running = false;
	const sleepers = new Set<() => void>();

	/** Sleep that stop() can cut short. */
	function sleep(ms: number): Promise<void> {
		return new Promise((resolve) => {
			const finish = () => {
				clearTimeout(timer);
				sleepers.delete(finish);
				resolve();
			};
			const timer = setTimeout(finish, ms);
			sleepers.add(finish);
		});
	}

	function stop() {
		generation += 1;
		running = false;
		for (const wake of [...sleepers]) wake();
	}

	return {
		get playing() {
			return running;
		},

		stop,

		async play({ frameCount, fps, loop = false, startIndex = 0, onFrame, onEnd }: PlayOptions) {
			stop(); // Retires any loop already running.
			if (frameCount <= 0) return;

			const myGeneration = (generation += 1);
			const current = () => myGeneration === generation;
			running = true;

			const interval = 1000 / clampFps(fps);
			let index = startIndex >= 0 && startIndex < frameCount ? startIndex : 0;
			let deadline = performance.now();

			try {
				while (current()) {
					await onFrame(index);
					if (!current()) break;

					deadline += interval;
					await sleep(Math.max(0, deadline - performance.now()));
					if (!current()) break;

					index += 1;
					if (index >= frameCount) {
						if (!loop) break;
						index = 0;
					}
				}
			} finally {
				// A superseded run must not clear the flag its replacement just set.
				if (current()) running = false;
				onEnd?.();
			}
		}
	};
}
