/**
 * Inline notifications, replacing the alert() calls that used to interrupt a
 * shoot with a modal the user had to dismiss one-handed.
 */

import { writable } from 'svelte/store';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
	id: number;
	kind: ToastKind;
	message: string;
	/** Optional single action, e.g. Undo. */
	action?: { label: string; run: () => void };
}

const DURATIONS: Record<ToastKind, number> = {
	info: 3000,
	success: 3000,
	error: 6000 // Errors say something went wrong, so give them time to be read.
};

const store = writable<Toast[]>([]);
export const toasts = { subscribe: store.subscribe };

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismissToast(id: number): void {
	const timer = timers.get(id);
	if (timer) {
		clearTimeout(timer);
		timers.delete(id);
	}
	store.update((list) => list.filter((toast) => toast.id !== id));
}

function push(kind: ToastKind, message: string, action?: Toast['action']): number {
	const id = nextId++;
	store.update((list) => [...list, { id, kind, message, action }]);
	timers.set(
		id,
		setTimeout(() => dismissToast(id), DURATIONS[kind])
	);
	return id;
}

export const toast = {
	info: (message: string, action?: Toast['action']) => push('info', message, action),
	success: (message: string, action?: Toast['action']) => push('success', message, action),
	error: (message: string, action?: Toast['action']) => push('error', message, action)
};

/** Clears everything, e.g. when leaving a page. */
export function clearToasts(): void {
	for (const timer of timers.values()) clearTimeout(timer);
	timers.clear();
	store.set([]);
}
