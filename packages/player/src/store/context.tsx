import type { ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';

import { createContext, useContext } from 'react';
import { useStore } from 'zustand';

import type { PlayerStore } from '#store/player-store.ts';

import { playerStore } from '#store/player-store.ts';

// Defaults to the module singleton; tests provide a fresh store so state never leaks between them
const PlayerStoreContext = createContext<StoreApi<PlayerStore>>(playerStore);

export function PlayerStoreProvider({
	children,
	store,
}: {
	children: ReactNode;
	store: StoreApi<PlayerStore>;
}) {
	return <PlayerStoreContext.Provider value={store}>{children}</PlayerStoreContext.Provider>;
}

export function usePlayer<Selected>(selector: (state: PlayerStore) => Selected): Selected {
	return useStore(useContext(PlayerStoreContext), selector);
}
