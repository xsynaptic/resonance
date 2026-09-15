import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { QueueItem } from '#types.ts';

// Vitest mocks only a file's first import of a module, so a chunk that keeps rejecting is driven through `createLazyPart` below
vi.mock('#components/queue-tray.tsx', () => ({
	QueueTrayPanel: () => {
		throw new Error('Failed to fetch dynamically imported module');
	},
}));

import { AudioPlayer } from '#components/audio-player.tsx';
import { createLazyPart } from '#components/create-lazy-part.tsx';
import { labels } from '#components/test-labels.ts';
import { createPlayerStore } from '#store/player-store.ts';

function LoadedPart({ name }: { name: string }) {
	return <p>{name}</p>;
}

function makeItem(id: string): QueueItem {
	return {
		albumLoudness: {},
		artistLine: 'Nebula Drift',
		durationMs: 180_000,
		loudness: {},
		releaseTitle: 'Cosmic Drift',
		title: `Track ${id}`,
		trackId: id,
	};
}

afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe('lazy parts', () => {
	test('a part that fails closes and leaves the bar mounted', async () => {
		const store = createPlayerStore();

		render(<AudioPlayer labels={labels} store={store} urls={undefined} />);
		act(() => {
			store.getState().loadQueue([makeItem('a'), makeItem('b')]);
		});
		fireEvent.click(screen.getByRole('button', { name: labels.queue }));

		await waitFor(() => {
			expect(store.getState().isTrayOpen).toBe(false);
		});
		expect(screen.getByRole('button', { name: labels.queue })).toBeInTheDocument();
	});

	// A tab left open across a deploy asks for a chunk the host no longer serves
	test('a rejected load reaches the boundary without a retry, and the next open asks again', async () => {
		let loads = 0;
		const onError = vi.fn();
		const part = createLazyPart(() => {
			loads += 1;

			return loads < 3
				? Promise.reject(new Error('Failed to fetch dynamically imported module'))
				: Promise.resolve(LoadedPart);
		});

		function renderOpen(key: number) {
			return <part.Component key={key} name="Loaded" onFailed={onError} />;
		}

		part.preload();

		const { rerender } = render(renderOpen(1));

		await waitFor(() => {
			expect(onError).toHaveBeenCalledOnce();
		});
		expect(loads).toBe(2);

		rerender(renderOpen(2));

		expect(await screen.findByText('Loaded')).toBeInTheDocument();
		expect(loads).toBe(3);
	});
});
