// Property syntax so the engine can hand a reader straight on without tripping `unbound-method`
export interface AudioGraph {
	analyser: () => AnalyserNode | undefined;
	// The device's output buffer, which only a context can report; zero wherever none was built
	outputDelay: () => number;
	// Autoplay policy can leave the context suspended and iOS can leave it interrupted
	resume: () => Promise<void>;
}

export function createAudioGraph(element: HTMLAudioElement): AudioGraph {
	let context: AudioContext | undefined;
	let analyserNode: AnalyserNode | undefined;

	claimPlaybackSession();

	function ensureAnalyser(): AnalyserNode | undefined {
		if (analyserNode) return analyserNode;

		// A media element source can be created once per element, so the context is built once, on the first ask
		context = new AudioContext();
		analyserNode = context.createAnalyser();

		// 4096 gives the low bands the resolution this catalogue needs; 0.3 keeps attacks sharp for a visualizer
		analyserNode.fftSize = 4096;
		analyserNode.smoothingTimeConstant = 0.3;

		context.createMediaElementSource(element).connect(analyserNode).connect(context.destination);

		// Nothing here suspends the context, so leaving `running` mid-play is an interruption; pausing keeps the listener's place
		context.addEventListener('statechange', () => {
			if (context?.state !== 'running' && !element.paused) element.pause();
		});

		return analyserNode;
	}

	return {
		analyser: ensureAnalyser,
		outputDelay: () => (context === undefined ? 0 : contextLatencySeconds(context)),
		resume: async () => {
			if (context !== undefined && context.state !== 'running') await context.resume();
		},
	};
}

// iOS mutes Web Audio with the ringer switch unless the page claims a playback session; only Safari has one
function claimPlaybackSession(): void {
	const { audioSession } = navigator as { audioSession?: { type: string } };

	if (audioSession) audioSession.type = 'playback';
}

// A browser missing either property counts it as zero; Firefox hardcodes `baseLatency` and Safari answers zero while paused
function contextLatencySeconds(context: BaseAudioContext): number {
	const { baseLatency, outputLatency } = context as {
		baseLatency?: unknown;
		outputLatency?: unknown;
	};

	return latencySeconds(baseLatency) + latencySeconds(outputLatency);
}

function latencySeconds(latency: unknown): number {
	return typeof latency === 'number' ? latency : 0;
}
