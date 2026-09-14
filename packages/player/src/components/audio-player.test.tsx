import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlayerUrls, QueueItem } from '#types.ts';

const engineMock = vi.hoisted(() => ({
	analyser: vi.fn(),
	canPlay: vi.fn(() => true),
	currentTime: vi.fn(() => 0),
	load: vi.fn(() => Promise.resolve()),
	outputDelay: vi.fn(() => 0),
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

import { AudioPlayer } from '#components/audio-player.tsx';
import * as Player from '#components/parts.ts';
import { createPlayerStore } from '#store/player-store.ts';

const testUrls: PlayerUrls = {
	stream: (trackId) =>
		Promise.resolve({ status: 'ok', url: `https://api.test/tracks/${trackId}/stream` }),
};

const labels = {
	capped: 'Daily limit reached',
	clearQueue: 'Clear',
	collapse: 'Collapse',
	empty: 'Queue is empty',
	error: 'Playback error',
	expand: 'Expand',
	loading: 'Loading',
	moved: 'Moved to position {position} of {total}',
	mute: 'Mute',
	next: 'Next',
	nowPlaying: 'Nothing playing',
	pause: 'Pause',
	play: 'Play',
	playlist: 'Playlist',
	previous: 'Previous',
	queue: 'Queue',
	removeFromQueue: 'Remove',
	reorder: 'Reorder',
	seek: 'Seek',
	shuffle: 'Shuffle',
	skipBack: 'Back 30 seconds',
	skipForward: 'Forward 30 seconds',
	timestampsPartial: 'Timestamps end here',
	toggleTimeMode: 'Toggle elapsed and remaining',
	tracklist: 'Tracklist',
	unmute: 'Unmute',
	unplayable: 'This browser cannot play the stream',
	volume: 'Volume',
	waveformPanel: 'Waveform detail',
	zoomIn: 'Zoom in',
	zoomOut: 'Zoom out',
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

const artwork = [
	{ src: '/artwork-120.webp', width: 120 },
	{ src: '/artwork-240.webp', width: 240 },
];

function preventNavigation(event: MouseEvent): void {
	event.preventDefault();
}

function renderPlayer() {
	const store = createPlayerStore();

	render(<AudioPlayer labels={labels} store={store} urls={testUrls} />);

	return store;
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe('AudioPlayer', () => {
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
		expect(screen.getByRole('button', { name: labels.pause })).toBeEnabled();

		await waitFor(() => {
			expect(engineMock.load).toHaveBeenCalledWith({
				gain: 1,
				resumeAtSeconds: 0,
				src: 'https://api.test/tracks/a/stream',
			});
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

	test('the play button follows intent and marks a load toward playback', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
		});

		const button = screen.getByRole('button', { name: labels.pause });

		expect(button).toHaveAttribute('data-loading');

		act(() => {
			store.getState().pause();
		});

		expect(screen.getByRole('button', { name: labels.play })).not.toHaveAttribute('data-loading');

		act(() => {
			store.setState({ status: 'loading' });
		});

		expect(screen.getByRole('button', { name: labels.play })).not.toHaveAttribute('data-loading');
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

	test('closes the queue tray on a click outside it and on Escape', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().loadQueue(release);
		});

		const trigger = screen.getByRole('button', { name: labels.queue });

		fireEvent.click(trigger);
		fireEvent.pointerDown(document.body);

		expect(store.getState().isTrayOpen).toBe(true);

		fireEvent.click(document.body);

		expect(store.getState().isTrayOpen).toBe(false);

		fireEvent.click(trigger);
		fireEvent.keyDown(screen.getByRole('button', { name: /Track b/ }), { key: 'Escape' });

		expect(store.getState().isTrayOpen).toBe(false);
		expect(trigger).toHaveFocus();
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

	test('lists the artwork renditions and collapses the image once it fails to load', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().loadQueue([makeItem('a', { artwork })]);
		});

		const image = document.querySelector('.player-artwork');
		if (!image) throw new Error('The bar rendered no artwork');

		expect(image).toHaveAttribute('srcset', '/artwork-120.webp 120w, /artwork-240.webp 240w');

		fireEvent.error(image);

		expect(document.querySelector('.player-artwork')).not.toBeInTheDocument();
	});

	test('renders no artwork where the host switches it off', () => {
		const store = createPlayerStore();

		render(<AudioPlayer isArtworkEnabled={false} labels={labels} store={store} urls={testUrls} />);
		act(() => {
			store.getState().loadQueue([makeItem('a', { artwork })]);
		});

		expect(document.querySelector('.player-artwork')).not.toBeInTheDocument();
	});

	test('renders the skip buttons only when the host names a skip', () => {
		renderPlayer();

		expect(screen.queryByRole('button', { name: labels.skipBack })).not.toBeInTheDocument();

		cleanup();

		const store = createPlayerStore();

		render(<AudioPlayer labels={labels} skipSeconds={30} store={store} urls={testUrls} />);

		act(() => {
			store.getState().playTrack(release, 'a');
			store.setState({ currentTimeSeconds: 100 });
		});
		fireEvent.click(screen.getByRole('button', { name: labels.skipForward }));

		expect(engineMock.seek).toHaveBeenCalledWith(130);

		fireEvent.click(screen.getByRole('button', { name: labels.skipBack }));

		expect(engineMock.seek).toHaveBeenCalledWith(100);
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

	test('flips the clock between elapsed and remaining', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
			store.setState({ currentTimeSeconds: 64 });
		});

		const clock = screen.getByRole('button', { name: labels.toggleTimeMode });

		expect(clock).toHaveTextContent('1:04');

		fireEvent.click(clock);

		expect(clock).toHaveTextContent('-1:56');
		expect(clock).toHaveAttribute('data-mode', 'remaining');
	});

	test('renders what the host composed into the track info beside the artist', () => {
		const store = createPlayerStore();

		render(
			<Player.Root store={store} urls={testUrls}>
				<Player.TrackInfo emptyLabel={labels.nowPlaying}>
					<span>Composed in</span>
				</Player.TrackInfo>
			</Player.Root>,
		);

		act(() => {
			store.getState().playTrack(release, 'a');
		});

		expect(screen.getByText('Nebula Drift').closest('.player-track-meta')).toHaveTextContent(
			'Composed in',
		);
	});

	test('expands into the overlay and closes it from the chevron and from the dialog', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().loadQueue(release);
		});
		fireEvent.click(screen.getByRole('button', { name: labels.expand }));

		const dialog = screen.getByRole('dialog', { hidden: true });

		expect(dialog).toHaveAttribute('open');

		fireEvent.click(screen.getByRole('button', { name: labels.collapse }));

		expect(store.getState().isOverlayOpen).toBe(false);
		expect(dialog).not.toHaveAttribute('open');

		fireEvent.click(screen.getByRole('button', { name: labels.expand }));
		act(() => {
			(dialog as HTMLDialogElement).close();
		});

		expect(store.getState().isOverlayOpen).toBe(false);
	});

	test('closes the overlay once the queue empties', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().loadQueue(release);
			store.getState().toggleOverlay();
		});
		fireEvent.click(screen.getByRole('button', { name: labels.clearQueue }));

		expect(store.getState().isOverlayOpen).toBe(false);
		expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
	});

	test('draws one waveform panel while the overlay is open', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
			store.getState().togglePanel();
			store.getState().toggleOverlay();
		});

		expect(screen.getAllByRole('group', { name: labels.waveformPanel })).toHaveLength(1);
	});

	test('closes the overlay for a plain link click and stays open for a modified one', () => {
		const store = renderPlayer();

		document.addEventListener('click', preventNavigation);
		act(() => {
			store.getState().loadQueue(release);
			store.getState().toggleOverlay();
		});

		const link = screen.getByRole('dialog', { hidden: true }).querySelector('a[href]');
		if (!link) throw new Error('The overlay rendered no link');

		fireEvent.click(link, { metaKey: true });
		fireEvent.click(link, { button: 1 });

		expect(store.getState().isOverlayOpen).toBe(true);

		fireEvent.click(link);

		expect(store.getState().isOverlayOpen).toBe(false);

		document.removeEventListener('click', preventNavigation);
	});

	test('focuses collapse on open and keeps focus on the tabs when the Tracklist goes', () => {
		const store = renderPlayer();
		const cuePoints = [
			{ artistLine: 'Nebula Drift', startSeconds: 0, title: 'Opening' },
			{ artistLine: '', startSeconds: 60, title: 'Middle' },
		];

		act(() => {
			store.getState().playTrack([makeItem('a', { cuePoints }), makeItem('b')], 'a');
			store.getState().toggleOverlay();
		});

		expect(screen.getByRole('button', { name: labels.collapse })).toHaveFocus();

		act(() => {
			screen.getByRole('button', { name: /Middle/ }).focus();
		});
		act(() => {
			store.getState().next();
		});

		expect(screen.getByRole('tab', { name: labels.playlist })).toHaveFocus();
	});

	test('seeks from a cue in the Tracklist and marks the current one', () => {
		const store = renderPlayer();
		const cuePoints = [
			{ artistLine: 'Nebula Drift', startSeconds: 0, title: 'Opening' },
			{ artistLine: '', startSeconds: 60, title: 'Middle' },
		];

		act(() => {
			store.getState().playTrack([makeItem('a', { cuePoints })], 'a');
			store.getState().toggleOverlay();
		});

		expect(screen.getByRole('tab', { name: labels.tracklist })).toHaveAttribute(
			'aria-selected',
			'true',
		);

		fireEvent.click(screen.getByRole('button', { name: /Middle/ }));

		expect(engineMock.seek).toHaveBeenCalledWith(60);
		expect(screen.getByRole('button', { name: /Middle/ })).toHaveAttribute('aria-current', 'true');
		expect(screen.getByRole('button', { name: /Opening/ })).not.toHaveAttribute('aria-current');
	});

	test('offers only the Playlist for an item without cue points', () => {
		const store = renderPlayer();

		act(() => {
			store.getState().playTrack(release, 'a');
			store.getState().toggleOverlay();
		});

		expect(screen.getAllByRole('tab')).toHaveLength(1);
		expect(screen.getByRole('button', { name: /Track b/ })).toBeInTheDocument();
	});

	test('renders a host composition of the parts through Player.Root', () => {
		const store = createPlayerStore();

		render(
			<Player.Root className="host-bar" store={store} urls={testUrls}>
				<Player.Transport labels={labels} />
				<Player.Time label={labels.toggleTimeMode} />
			</Player.Root>,
		);

		const root = screen.getByRole('button', { name: labels.play }).closest('.player');

		expect(root).toHaveClass('host-bar');
		expect(root).toHaveAttribute('data-status', 'idle');
		expect(store.getState().urls).toBe(testUrls);
		expect(screen.queryByRole('button', { name: labels.queue })).not.toBeInTheDocument();
	});
});
