// Structural, so tests drive a plain EventTarget; an HTMLMediaElement satisfies it
export interface PlaybackMedia extends EventTarget {
	readonly currentTime: number;
	readonly paused: boolean;
	readonly seeking: boolean;
}

export interface PlaybackOptions {
	// Asked as each listen opens; `undefined` leaves that playback unreported
	identify: () => string | undefined;
	// Heard seconds before a listen reports at all
	minimumSeconds?: number;
	onReport: (report: PlaybackReport) => void;
	reportEverySeconds?: number;
}

// `heardSeconds` is the listen's running total, so a report lost or repeated costs nothing
export interface PlaybackReport {
	heardSeconds: number;
	itemId: string;
	listenId: string;
}

interface OpenListen {
	heardSeconds: number;
	itemId: string;
	listenId: string;
	// The last whole total sent; an unchanged total is not worth a request
	reportedSeconds: number;
}

// `seeking` names a seek outright, so this is the backstop for an engine that moves the clock without one
const maximumStepSeconds = 2;

export function monitorPlayback(media: PlaybackMedia, options: PlaybackOptions): () => void {
	const { identify, minimumSeconds = 0, onReport, reportEverySeconds = 300 } = options;
	const holding = new AbortController();
	const { signal } = holding;

	let listen: OpenListen | undefined;
	let lastPosition = media.currentTime;

	function openListen(): void {
		if (listen) return;

		const itemId = identify();
		if (itemId === undefined) return;

		listen = { heardSeconds: 0, itemId, listenId: crypto.randomUUID(), reportedSeconds: 0 };
	}

	function report(): void {
		if (!listen) return;

		const total = Math.floor(listen.heardSeconds);
		if (total < minimumSeconds || total === listen.reportedSeconds) return;

		listen.reportedSeconds = total;
		onReport({ heardSeconds: total, itemId: listen.itemId, listenId: listen.listenId });
	}

	function closeListen(): void {
		report();
		listen = undefined;
	}

	function onTimeUpdate(): void {
		const position = media.currentTime;
		const step = position - lastPosition;

		lastPosition = position;

		if (!listen || media.paused || media.seeking) return;

		if (step > 0 && step <= maximumStepSeconds) listen.heardSeconds += step;
		if (listen.heardSeconds - listen.reportedSeconds >= reportEverySeconds) report();
	}

	function onSeek(): void {
		lastPosition = media.currentTime;
	}

	media.addEventListener(
		'playing',
		() => {
			openListen();
			lastPosition = media.currentTime;
		},
		{ signal },
	);
	media.addEventListener('timeupdate', onTimeUpdate, { signal });
	media.addEventListener('seeking', onSeek, { signal });
	media.addEventListener('seeked', onSeek, { signal });
	media.addEventListener('pause', report, { signal });
	media.addEventListener('ended', closeListen, { signal });
	// `load()` swaps the source, which is how a player changes track
	media.addEventListener('emptied', closeListen, { signal });

	// A mobile browser can kill a playing tab with nothing further fired
	document.addEventListener(
		'visibilitychange',
		() => {
			if (document.visibilityState === 'hidden') report();
		},
		{ signal },
	);
	window.addEventListener('pagehide', report, { signal });

	// The `playing` that started this has already fired
	if (!media.paused) openListen();

	return () => {
		report();
		holding.abort();
	};
}
