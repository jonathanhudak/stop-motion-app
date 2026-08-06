/**
 * Object URLs for Blobs, cached so the same Blob keeps one URL across renders
 * and revoked when it drops out of use.
 */
export function createObjectUrlCache() {
	const cache = new Map<Blob, string>();

	return {
		get(blob: Blob): string {
			let url = cache.get(blob);
			if (!url) {
				url = URL.createObjectURL(blob);
				cache.set(blob, url);
			}
			return url;
		},

		/** Revoke URLs for Blobs no longer in `keep`. */
		prune(keep: Iterable<Blob>): void {
			const live = new Set(keep);
			for (const [blob, url] of cache) {
				if (!live.has(blob)) {
					URL.revokeObjectURL(url);
					cache.delete(blob);
				}
			}
		},

		revokeAll(): void {
			for (const url of cache.values()) URL.revokeObjectURL(url);
			cache.clear();
		}
	};
}
