import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerUrls, QueueItem, QueueItemDetail } from '#types.ts';

import { retryDelayMs } from '#lib/retry-delay.ts';
import { isSameJson } from '#queue/queue-state.ts';

// A request that brought nothing, so the bar stops waiting and draws its groove
const noDetail: QueueItemDetail = {};

export function bindQueueDetails(api: StoreApi<PlayerStore>): void {
	const requested = new Set<string>();
	const failed = new Set<string>();
	let resolveDetail: PlayerUrls['detail'];
	let failures = 0;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;

	function land(item: QueueItem, detail: QueueItemDetail | undefined): void {
		const { details, queue } = api.getState();
		if (queue.every((queued) => queued.itemId !== item.itemId)) return;

		const held = details.get(item.itemId);
		// A failed request keeps what storage restored
		const landed = detail ?? held ?? noDetail;
		if (held !== undefined && isSameJson(held, landed)) return;

		api.setState({ details: new Map(details).set(item.itemId, landed) });
	}

	function forgetUnqueued(): void {
		const { details, queue } = api.getState();
		const queuedIds = new Set(queue.map((item) => item.itemId));

		for (const itemId of requested) {
			if (queuedIds.has(itemId)) continue;

			requested.delete(itemId);
			failed.delete(itemId);
		}

		if (failed.size === 0) {
			clearTimeout(retryTimer);
			retryTimer = undefined;
		}

		// No iterator helpers: Safari before 18.4 lacks them, and a throw here stops the player booting
		const kept = [...details].filter(([itemId]) => queuedIds.has(itemId));
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

		for (const item of queue) {
			if (requested.has(item.itemId)) continue;

			requested.add(item.itemId);
			void request(resolveDetail, item);
		}
	}

	async function request(
		resolve: NonNullable<PlayerUrls['detail']>,
		item: QueueItem,
	): Promise<void> {
		let detail: QueueItemDetail | undefined;

		try {
			detail = await resolve(item);
		} catch {
			fail(item);
			return;
		}

		failures = 0;
		land(item, detail);
	}

	function fail(item: QueueItem): void {
		land(item, undefined);
		if (!requested.has(item.itemId)) return;

		failed.add(item.itemId);
		if (retryTimer !== undefined) return;

		failures += 1;
		retryTimer = setTimeout(retry, retryDelayMs(failures));
	}

	function retry(): void {
		retryTimer = undefined;

		for (const itemId of failed) requested.delete(itemId);

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
