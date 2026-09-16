// The graph the element plays through: normalization, then volume, with an analysis tap spliced in on demand
// Property syntax so the engine can hand a reader straight on without tripping `unbound-method`
export interface AudioGraph {
	// Built on the first ask, so a page that never draws a visualizer never carries the node
	analyser: () => AnalyserNode | undefined;
	// A media element source can be created once, so the graph is built once, inside the first gesture
	ensure: () => void;
	// The device's buffer; the graph itself adds no delay of its own
	outputDelay: () => number;
	// Autoplay policy can leave the context suspended and iOS can leave it interrupted; a running one resolves without doing anything
	resume: () => Promise<void>;
	setGain: (gain: number) => void;
	setVolume: (volume: number) => void;
}

export function createAudioGraph(element: HTMLAudioElement): AudioGraph {
	let context: AudioContext | undefined;
	let normalizationNode: GainNode | undefined;
	let volumeNode: GainNode | undefined;
	let analyserNode: AnalyserNode | undefined;

	// Applied to the live nodes once the graph exists
	let pendingGain = 1;
	let pendingVolume = 1;

	function ensure(): void {
		if (context) return;

		claimPlaybackSession();

		// A playback buffer rather than the 512-frame interactive default, which underruns on Android Chrome
		context = new AudioContext({ latencyHint: 'playback' });
		normalizationNode = context.createGain();
		volumeNode = context.createGain();
		normalizationNode.gain.value = pendingGain;
		volumeNode.gain.value = pendingVolume;

		context
			.createMediaElementSource(element)
			.connect(normalizationNode)
			.connect(volumeNode)
			.connect(context.destination);

		// Nothing here suspends the context, so leaving `running` mid-play is an interruption; pausing keeps the listener's place
		context.addEventListener('statechange', () => {
			if (context?.state !== 'running' && !element.paused) element.pause();
		});
	}

	// Spliced ahead of the volume stage, so a visualizer follows the track rather than the volume knob
	// An analyser passes its input through, so the reconnection costs at most a render quantum
	function ensureAnalyser(): AnalyserNode | undefined {
		if (analyserNode) return analyserNode;
		if (context === undefined || !normalizationNode || !volumeNode) return undefined;

		analyserNode = context.createAnalyser();

		// 4096 gives the low bands the resolution this catalogue needs; 0.3 keeps attacks sharp for a visualizer
		// Time-domain reads are unaffected by the smoothing
		analyserNode.fftSize = 4096;
		analyserNode.smoothingTimeConstant = 0.3;

		normalizationNode.disconnect();
		normalizationNode.connect(analyserNode).connect(volumeNode);

		return analyserNode;
	}

	return {
		analyser: ensureAnalyser,
		ensure,
		outputDelay: () => (context === undefined ? 0 : contextLatencySeconds(context)),
		resume: async () => {
			if (context !== undefined && context.state !== 'running') await context.resume();
		},
		setGain: (gain) => {
			pendingGain = gain;
			if (normalizationNode) normalizationNode.gain.value = gain;
		},
		setVolume: (volume) => {
			pendingVolume = volume;
			if (volumeNode) volumeNode.gain.value = volume;
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
