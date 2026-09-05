import type { ComponentPropsWithoutRef, ElementType } from 'react';
import type { StoreApi } from 'zustand/vanilla';

import { useEffect } from 'react';

import type { PlayerStore } from '#store/player-store.ts';
import type { PlayerUrls } from '#types.ts';

import { joinClassNames } from '#lib/class-names.ts';
import { PlayerStoreProvider, usePlayer } from '#store/context.tsx';
import { playerStore } from '#store/player-store.ts';

export type PlayerRootProps = ComponentPropsWithoutRef<'div'> & {
	as?: ElementType | undefined;
	// Tests and secondary mounts pass a fresh store for isolation
	store?: StoreApi<PlayerStore> | undefined;
	// `undefined` renders the player inert
	urls: PlayerUrls | undefined;
};

export function PlayerRoot({ store = playerStore, urls, ...rest }: PlayerRootProps) {
	useEffect(() => {
		store.getState().configure({ urls });
	}, [store, urls]);

	return (
		<PlayerStoreProvider store={store}>
			<RootElement {...rest} />
		</PlayerStoreProvider>
	);
}

// Split out because a component cannot read the store it is itself providing
function RootElement({
	as: RootTag = 'div',
	className,
	...rest
}: Omit<PlayerRootProps, 'store' | 'urls'>) {
	const status = usePlayer((state) => state.status);

	return <RootTag className={joinClassNames('player', className)} data-status={status} {...rest} />;
}
