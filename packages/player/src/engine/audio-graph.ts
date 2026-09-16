// The graph the element plays through: normalization, then the analysis tap, then volume
// Property syntax so the engine can hand a reader straight on without tripping `unbound-method`
export interface AudioGraph {
	analyser: () => AnalyserNode | undefined;
	// A media element source can be created once, so the graph is built once, inside the first gesture
	ensure: () => void;
	// The graph's own share of how far the element's clock runs ahead of the sound
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
	let analysisDelaySeconds = 0;

	// Applied to the live nodes once the graph exists
	let pendingGain = 1;
	let pendingVolume = 1;

	function ensure(): void {
		if (context) return;

		claimPlaybackSession();

		context = new AudioContext();
		normalizationNode = context.createGain();
		volumeNode = context.createGain();
		analyserNode = context.createAnalyser();

		// 4096 gives the low bands the resolution this catalogue needs; 0.3 keeps attacks sharp for a visualizer
		// Time-domain reads are unaffected by the smoothing
		analyserNode.fftSize = 4096;
		analyserNode.smoothingTimeConstant = 0.3;
		normalizationNode.gain.value = pendingGain;
		volumeNode.gain.value = pendingVolume;

		// Playback waits for the analysis window rather than the display trailing the sound
		analysisDelaySeconds = measureAnalysisDelay(analyserNode);

		const delayNode = context.createDelay(1);

		delayNode.delayTime.value = analysisDelaySeconds;

		// The tap sits ahead of the volume stage so the display follows the track, not the volume knob
		context
			.createMediaElementSource(element)
			.connect(normalizationNode)
			.connect(analyserNode)
			.connect(delayNode)
			.connect(volumeNode)
			.connect(context.destination);

		// Nothing here suspends the context, so leaving `running` mid-play is an interruption; pausing keeps the listener's place
		context.addEventListener('statechange', () => {
			if (context?.state !== 'running' && !element.paused) element.pause();
		});
	}

	return {
		analyser: () => analyserNode,
		ensure,
		outputDelay: () =>
			context === undefined ? 0 : analysisDelaySeconds + outputLatencySeconds(context),
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

// The analyser's window weights a transient fully only at its midpoint, and output latency is a credit against that lag
// Floored at zero because a long output latency (Bluetooth) already puts the display ahead
function measureAnalysisDelay(analyser: AnalyserNode): number {
	const windowCentreSeconds = analyser.fftSize / 2 / analyser.context.sampleRate;

	return Math.max(0, windowCentreSeconds - outputLatencySeconds(analyser.context));
}

// Only AudioContext carries outputLatency, and an analyser types its context as the base class
function outputLatencySeconds(context: BaseAudioContext): number {
	const latency: unknown = (context as { outputLatency?: unknown }).outputLatency;

	return typeof latency === 'number' ? latency : 0;
}
