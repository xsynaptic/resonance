import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlayerUrls, QueueItem } from '#types.ts';

const engineMock = vi.hoisted(() => ({
	analyser: vi.fn(),
	currentTime: vi.fn(() => 0),
	load: vi.fn(() => Promise.resolve()),
	pause: vi.fn(),
	play: vi.fn(() => Promise.resolve()),
	prepare: vi.fn(),
	reset: vi.fn(),
	seek: vi.fn(),
	setVolume: vi.fn(),
}));

vi.mock('#engine/audio-engine.ts', () => ({
	createAudioEngine: () => engineMock,
}));

import { MusicPlayer } from '#components/music-player.tsx';
import { createPlayerStore } from '#store/player-store.ts';

const testUrls: PlayerUrls = {
	stream: (trackId) =>
		Promise.resolve({ status: 'ok', url: `https://api.test/tracks/${trackId}/stream` }),
	waveform: () => Promise.resolve(undefined),
};

const labels = {
	capped: 'Daily limit reached',
	clearQueue: 'Clear',
	empty: 'Queue is empty',
	error: 'Playback error',
	loading: 'Loading',
	next: 'Next',
	nowPlaying: 'Nothing playing',
	pause: 'Pause',
	play: 'Play',
	previous: 'Previous',
	queue: 'Queue',
	removeFromQueue: 'Remove',
	seek: 'Seek',
	shuffle: 'Shuffle',
	volume: 'Volume',
};

function makeItem(id: string, extra: Partial<QueueItem> = {}): QueueItem {
	return {
		albumLoudness: {},
		artistLine: 'Nebula Drift',
		durationMs: 180_000,
		loudness: {},
		releaseTitle: 'Cosmic Drift',
		title: `Track ${id}`,
		trackId: id,
		...extra,
	};
}

const releaseHref = '/releases/cosmic-drift';
const release = [makeItem('a', { releaseHref }), makeItem('b', { releaseHref })];

function renderPlayer(variant: 'full' | 'mini' = 'full') {
	const store = createPlayerStore();

	render(
		<MusicPlayer
			labels={labels}
			showSignalDisplay={false}
			store={store}
			urls={testUrls}
			variant={variant}
		/>,
	);

	return store;
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	cleanup();
});

describe('MusicPlayer', () => {
	test('disables transport and shows the placeholder with an empty queue', () => {
		renderPlayer();

		expect(screen.getByRole('button', { name: labels.play })).toBeDisabled();
		expect(screen.getByText(labels.nowPlaying)).toBeInTheDocument();
	});

	test('shows the loaded track and enables transport after a play', async () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
		});

		expect(screen.getByRole('link', { name: 'Track a' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: labels.play })).toBeEnabled();

		await waitFor(() => {
			expect(engineMock.load).toHaveBeenCalledWith('https://api.test/tracks/a/stream', 1, true);
		});
	});

	test('reports transport presses to the store', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
		});
		fireEvent.click(screen.getByRole('button', { name: labels.next }));

		expect(store.getState().currentIndex).toBe(1);

		act(() => {
			store.setState({ status: 'playing' });
		});
		fireEvent.click(screen.getByRole('button', { name: labels.pause }));

		expect(engineMock.pause).toHaveBeenCalled();
	});

	test('opens the queue tray and jumps to a track', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
		});
		fireEvent.click(screen.getByRole('button', { name: labels.queue }));
		fireEvent.click(screen.getByRole('button', { name: /Track b/ }));

		expect(store.getState().currentIndex).toBe(1);
	});

	test('draws a heading over each section of the queue and drops shuffle', () => {
		const store = renderPlayer();

		act(() => {
			store
				.getState()
				.loadQueue([
					makeItem('a', { sectionLabel: 'Darkpsy' }),
					makeItem('b'),
					makeItem('c', { sectionLabel: 'Forest' }),
				]);
		});
		fireEvent.click(screen.getByRole('button', { name: labels.queue }));

		expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
			'Darkpsy',
			expect.stringContaining('Track a'),
			expect.stringContaining('Track b'),
			'Forest',
			expect.stringContaining('Track c'),
		]);
		expect(screen.queryByRole('button', { name: labels.shuffle })).not.toBeInTheDocument();
	});

	test('offers shuffle on an ordinary queue', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().loadQueue(release);
		});
		fireEvent.click(screen.getByRole('button', { name: labels.queue }));

		expect(screen.getByRole('button', { name: labels.shuffle })).toBeInTheDocument();
	});

	test('renders the title as text when the host names no release destination', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack([makeItem('a')], 'a');
		});

		expect(screen.queryByRole('link', { name: 'Track a' })).not.toBeInTheDocument();
		expect(screen.getByText('Track a')).toBeVisible();
	});

	test('drops the tray in the mini variant, keeping the seek surface', () => {
		renderPlayer('mini');

		expect(screen.queryByRole('button', { name: labels.queue })).not.toBeInTheDocument();
		expect(screen.getByRole('slider', { name: labels.seek })).toBeVisible();
	});

	test('seeks in seconds off the range input', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
		});
		fireEvent.change(screen.getByRole('slider', { name: labels.seek }), {
			target: { value: '42' },
		});

		expect(engineMock.seek).toHaveBeenCalledWith(42);
	});

	test('swaps the range input for the waveform surface once a track carries peaks', () => {
		const store = renderPlayer();

		expect(screen.getByRole('slider', { name: labels.seek }).tagName).toBe('INPUT');

		act(() => {
			store.getState().playTrack([makeItem('a', { waveformOverview: [0.1, 0.9] })], 'a');
		});

		expect(screen.getByRole('slider', { name: labels.seek }).tagName).toBe('CANVAS');
	});

	test('reports a volume change', () => {
		const store = renderPlayer();

		fireEvent.change(screen.getByRole('slider', { name: labels.volume }), {
			target: { value: '0.5' },
		});

		expect(store.getState().volume).toBe(0.5);
	});

	test('surfaces the error state in the status region', () => {
		const store = renderPlayer();

		act(() => {
			store.setState({ status: 'error' });
		});

		expect(screen.getByRole('status')).toHaveTextContent(labels.error);
	});
});
