import type { PlayerStore } from '@xsynaptic/plazmoid-core';

import { bind } from '@xsynaptic/plazmoid-core';

import type { PlayerContext } from '#elements/player-context.ts';
import type { ViewStore } from '#view/view-store.ts';

// For a selection that crosses both stores; one source, so the catch in `bind` covers it too
// eslint-disable-next-line max-params -- mirrors `bind`, with the context in the store's place
export function bindPlayer<Selected>(
	{ store, view }: Pick<PlayerContext, 'store' | 'view'>,
	select: (state: PlayerStore, view: ViewStore) => Selected,
	apply: (selected: Selected) => void,
	signal: AbortSignal,
): void {
	const read = () => [store.getState(), view.getState()] as const;

	bind(
		{
			getState: read,
			subscribe: (listener) => {
				const notify = (): void => {
					listener(read());
				};
				const unsubscribeStore = store.subscribe(notify);
				const unsubscribeView = view.subscribe(notify);

				return () => {
					unsubscribeStore();
					unsubscribeView();
				};
			},
		},
		([state, viewState]) => select(state, viewState),
		apply,
		signal,
	);
}
