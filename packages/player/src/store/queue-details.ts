import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerUrls, Track, TrackDetail } from '#types.ts';

import { retryDelayMs } from '#lib/retry-delay.ts';
import { isSameJson } from '#queue/queue-state.ts';

// A request that brought nothing, so the bar stops waiting and draws its groove
const noDetail: TrackDetail = {};

export function bindQueueDetails(api: StoreApi<PlayerStore>): void {
	const requested = new Set<string>();
	const failed = new Set<string>();
	let resolveDetail: PlayerUrls['detail'];
	let failures = 0;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;

	function land(track: Track, detail: TrackDetail | undefined): void {
		const { details, queue } = api.getState();
		if (queue.every((queued) => queued.trackId !== track.trackId)) return;

		const held = details.get(track.trackId);
		// A failed request keeps what storage restored
		const landed = detail ?? held ?? noDetail;
		if (held !== undefined && isSameJson(held, landed)) return;

		api.setState({ details: new Map(details).set(track.trackId, landed) });
	}

	function forgetUnqueued(): void {
		const { details, queue } = api.getState();
		const queuedIds = new Set(queue.map((track) => track.trackId));

		for (const trackId of requested) {
			if (queuedIds.has(trackId)) continue;

			requested.delete(trackId);
			failed.delete(trackId);
		}

		if (failed.size === 0) {
			clearTimeout(retryTimer);
			retryTimer = undefined;
		}

		// No iterator helpers: Safari before 18.4 lacks them, and a throw here stops the player booting
		const kept = [...details].filter(([trackId]) => queuedIds.has(trackId));
		if (kept.length === details.size) return;

		api.setState({ details: new Map(kept) });
	}

	function requestQueued(): void {
		const { queue, urls } = api.getState();

		if (urls?.detail !== resolveDetail) {
			resolveDetail = urls?.detail;
			requested.clear();
			failed.clear();
		}

		if (!resolveDetail) return;

		for (const track of queue) {
			if (requested.has(track.trackId)) continue;

			requested.add(track.trackId);
			void request(resolveDetail, track);
		}
	}

	async function request(resolve: NonNullable<PlayerUrls['detail']>, track: Track): Promise<void> {
		let detail: TrackDetail | undefined;

		try {
			detail = await resolve(track);
		} catch {
			fail(track);
			return;
		}

		failures = 0;
		land(track, detail);
	}

	function fail(track: Track): void {
		land(track, undefined);
		if (!requested.has(track.trackId)) return;

		failed.add(track.trackId);
		if (retryTimer !== undefined) return;

		failures += 1;
		retryTimer = setTimeout(retry, retryDelayMs(failures));
	}

	function retry(): void {
		retryTimer = undefined;

		for (const trackId of failed) requested.delete(trackId);

		failed.clear();
		requestQueued();
	}

	function sync(): void {
		forgetUnqueued();
		requestQueued();
	}

	sync();
	api.subscribe((state, previous) => {
		if (state.queue !== previous.queue || state.urls !== previous.urls) sync();
	});
}
