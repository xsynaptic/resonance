import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerUrls, QueueItem, QueueItemDetail } from '#types.ts';

import { isSameJson } from '#queue/queue-state.ts';

// A settled request that brought nothing, so the bar stops waiting and draws its groove
const noDetail: QueueItemDetail = {};

export function bindQueueDetails(api: StoreApi<PlayerStore>): void {
	const requested = new Set<string>();
	let resolveDetail: PlayerUrls['detail'];

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
			if (!queuedIds.has(itemId)) requested.delete(itemId);
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
		}

		if (!resolveDetail) return;

		for (const item of queue) {
			if (requested.has(item.itemId)) continue;

			requested.add(item.itemId);
			void requestDetail(resolveDetail, item).then((detail) => {
				land(item, detail);
			});
		}
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

async function requestDetail(
	resolveDetail: NonNullable<PlayerUrls['detail']>,
	item: QueueItem,
): Promise<QueueItemDetail | undefined> {
	try {
		return await resolveDetail(item);
	} catch {
		return undefined;
	}
}
