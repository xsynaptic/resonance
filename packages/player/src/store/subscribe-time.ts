import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { SubscribeTime } from '#types.ts';

export function subscribeStoreTime(store: StoreApi<PlayerStore>): SubscribeTime {
	return (onTime) => {
		onTime(store.getState().currentTimeSeconds);

		return store.subscribe((state) => {
			onTime(state.currentTimeSeconds);
		});
	};
}
