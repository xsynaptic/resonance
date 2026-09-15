// @vitest-environment happy-dom
import type * as PlayerPackage from '@xsynaptic/player';
import type { Root } from 'react-dom/client';

import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

const playerState = vi.hoisted(() => ({
	currentIndex: undefined,
	currentTimeSeconds: 0,
	isPlayIntended: false,
	playQueue: vi.fn(),
	playRelease: vi.fn(),
	playTrack: vi.fn(),
	queue: [],
	queueTrack: vi.fn(),
	refreshQueue: vi.fn(),
	setOverlayOpen: vi.fn(),
}));

vi.mock('@xsynaptic/player', async (importOriginal) => {
	const { currentCue, loadedItem } = await importOriginal<typeof PlayerPackage>();

	return {
		AudioPlayer: vi.fn(),
		bindMediaSession: vi.fn(),
		currentCue,
		loadedItem,
		playerStore: { getState: () => playerState, subscribe: vi.fn().mockReturnValue(vi.fn()) },
	};
});

import { heldPressAttribute, listeningEvent } from '#components/player/player-held-press.ts';
import { PlayerIsland } from '#components/player/player-island.tsx';
import { getPlayerLabels } from '#components/player/player-labels.ts';

let root: Root | undefined;

afterEach(() => {
	root?.unmount();
	root = undefined;
	document.body.replaceChildren();
	vi.clearAllMocks();
});

describe('PlayerIsland', () => {
	test('replays a press the directive held, once its own listener is attached', async () => {
		document.body.innerHTML = `
			<div data-player-payload='[{"trackId":"a"}]'></div>
			<button data-play-track="a" ${heldPressAttribute}></button>
		`;

		const onListening = vi.fn();
		const container = document.createElement('div');

		document.addEventListener(listeningEvent, onListening, { once: true });
		document.body.append(container);
		root = createRoot(container);
		root.render(
			<PlayerIsland isOverlayEnabled={false} labels={getPlayerLabels()} skipSeconds={30} />,
		);

		await vi.waitFor(() => {
			expect(playerState.playTrack).toHaveBeenCalledWith([{ trackId: 'a' }], 'a');
		});
		expect(onListening).toHaveBeenCalledOnce();
		expect(document.querySelector('[data-play-track]')?.hasAttribute(heldPressAttribute)).toBe(
			false,
		);
	});

	test('refreshes the queue from the page payload on mount and after a soft navigation', async () => {
		document.body.innerHTML = `<div data-player-payload='[{"trackId":"a"}]'></div>`;

		const container = document.createElement('div');

		document.body.append(container);
		root = createRoot(container);
		root.render(
			<PlayerIsland isOverlayEnabled={false} labels={getPlayerLabels()} skipSeconds={30} />,
		);

		await vi.waitFor(() => {
			expect(playerState.refreshQueue).toHaveBeenCalledWith([{ trackId: 'a' }]);
		});

		document
			.querySelector('[data-player-payload]')
			?.setAttribute('data-player-payload', '[{"trackId":"b"}]');
		document.dispatchEvent(new Event('astro:after-swap'));

		expect(playerState.refreshQueue).toHaveBeenLastCalledWith([{ trackId: 'b' }]);
	});
});
