import type { PlayerStoreApi } from '#store/player-types.ts';
import type { SubscribeTime } from '#types.ts';

export function subscribeStoreTime(store: PlayerStoreApi): SubscribeTime {
	return (onTime) => {
		onTime(store.getState().currentTimeSeconds);

		return store.subscribe((state) => {
			onTime(state.currentTimeSeconds);
		});
	};
}
