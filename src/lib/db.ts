/**
 * IndexedDB access for stop-motion projects.
 *
 * Schema history:
 *   v1 — store `animations`, keyPath `name`, frames as PNG data URLs.
 *   v2 — store `projects`, keyPath `id`, frames as Blobs, plus fps/timestamps.
 *        Names are no longer identity, so renaming is a single put.
 */

const DB_NAME = 'AnimationDB';
const DB_VERSION = 2;
const STORE = 'projects';
const LEGACY_STORE = 'animations';

export const DEFAULT_FPS = 10;

export interface Project {
	id: string;
	name: string;
	frames: Blob[];
	fps: number;
	createdAt: number;
	updatedAt: number;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
	});
}

/** Synchronous so it can run inside a versionchange transaction. */
function dataUrlToBlob(dataUrl: string): Blob {
	const [header, encoded] = dataUrl.split(',');
	const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new Blob([bytes], { type: mime });
}

function newId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface LegacyAnimation {
	name: string;
	frames: string[];
}

function migrateFromV1(db: IDBDatabase, transaction: IDBTransaction): void {
	// Read every legacy record before dropping the store; the versionchange
	// transaction stays open across these callbacks.
	const legacy: LegacyAnimation[] = [];
	const cursorRequest = transaction.objectStore(LEGACY_STORE).openCursor();

	cursorRequest.onsuccess = () => {
		const cursor = cursorRequest.result;
		if (cursor) {
			legacy.push(cursor.value as LegacyAnimation);
			cursor.continue();
			return;
		}

		db.deleteObjectStore(LEGACY_STORE);
		const store = createProjectStore(db);
		const now = Date.now();
		for (const animation of legacy) {
			store.put({
				id: newId(),
				name: animation.name,
				frames: (animation.frames ?? []).map(dataUrlToBlob),
				fps: DEFAULT_FPS,
				createdAt: now,
				updatedAt: now
			} satisfies Project);
		}
	};
}

function createProjectStore(db: IDBDatabase): IDBObjectStore {
	const store = db.createObjectStore(STORE, { keyPath: 'id' });
	// Non-unique: duplicate names are allowed now that `id` is identity.
	store.createIndex('name', 'name', { unique: false });
	return store;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;

	const pending = new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = (event) => {
			const db = request.result;
			const transaction = request.transaction;
			if (!transaction) return;

			if (event.oldVersion < 1 || !db.objectStoreNames.contains(LEGACY_STORE)) {
				if (!db.objectStoreNames.contains(STORE)) createProjectStore(db);
				return;
			}

			migrateFromV1(db, transaction);
		};

		request.onsuccess = () => {
			const db = request.result;
			// Another tab requested a newer version; drop our handle so it can proceed.
			db.onversionchange = () => {
				db.close();
				dbPromise = null;
			};
			resolve(db);
		};

		request.onerror = () => reject(request.error ?? new Error('Failed to open database'));
		request.onblocked = () =>
			reject(new Error('Database upgrade blocked by another open tab. Close it and reload.'));
	}).catch((error: unknown) => {
		dbPromise = null;
		throw error;
	});

	dbPromise = pending;
	return pending;
}

async function withStore<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
	const db = await openDatabase();
	const transaction = db.transaction([STORE], mode);
	const result = await run(transaction.objectStore(STORE));

	if (mode === 'readonly') return result;

	// Only writes need the durability guarantee of a completed transaction.
	return new Promise<T>((resolve, reject) => {
		transaction.oncomplete = () => resolve(result);
		transaction.onabort = transaction.onerror = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction failed'));
	});
}

/**
 * Cheap despite returning frames: IndexedDB hands back Blob references without
 * reading their bytes, unlike the data URLs this replaced.
 */
export function listProjects(): Promise<Project[]> {
	return withStore('readonly', (store) => promisify<Project[]>(store.getAll())).then((projects) =>
		projects.sort((a, b) => b.updatedAt - a.updatedAt)
	);
}

export function getProject(id: string): Promise<Project | undefined> {
	return withStore('readonly', (store) => promisify<Project | undefined>(store.get(id)));
}

/** Fallback for links minted before ids existed, where the name was the key. */
export function getProjectByName(name: string): Promise<Project | undefined> {
	return withStore('readonly', (store) =>
		promisify<Project | undefined>(store.index('name').get(name))
	);
}

export async function createProject(
	input: Pick<Project, 'name'> & Partial<Pick<Project, 'frames' | 'fps'>>
): Promise<Project> {
	const now = Date.now();
	const project: Project = {
		id: newId(),
		name: input.name,
		frames: input.frames ?? [],
		fps: input.fps ?? DEFAULT_FPS,
		createdAt: now,
		updatedAt: now
	};
	await withStore('readwrite', (store) => promisify(store.add(project)));
	return project;
}

export async function saveProject(project: Project): Promise<Project> {
	const updated: Project = { ...project, updatedAt: Date.now() };
	await withStore('readwrite', (store) => promisify(store.put(updated)));
	return updated;
}

/** Atomic, unlike the delete-then-add rename it replaces. */
export async function renameProject(id: string, name: string): Promise<Project> {
	const db = await openDatabase();
	const transaction = db.transaction([STORE], 'readwrite');
	const store = transaction.objectStore(STORE);
	const existing = await promisify<Project | undefined>(store.get(id));
	if (!existing) throw new Error(`No project with id ${id}`);

	const updated: Project = { ...existing, name, updatedAt: Date.now() };
	await promisify(store.put(updated));

	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve(updated);
		transaction.onabort = transaction.onerror = () =>
			reject(transaction.error ?? new Error('Rename failed'));
	});
}

export function deleteProject(id: string): Promise<void> {
	return withStore('readwrite', (store) => promisify(store.delete(id))).then(() => undefined);
}

/** Canvas capture, as a Blob rather than a base64 data URL. */
export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error('Failed to encode canvas'));
		}, type);
	});
}
