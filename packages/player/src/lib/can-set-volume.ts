let answer: boolean | undefined;

// iOS Safari makes `volume` read-only, so the slider, the mute gain and any normalization silently do nothing
// Probed rather than sniffed, as Video.js and Media Chrome both do; no UA string answers this
export function canSetVolume(): boolean {
	if (answer !== undefined) return answer;

	try {
		const probe = document.createElement('audio');

		probe.volume = 0.5;
		answer = probe.volume === 0.5;
	} catch {
		answer = false;
	}

	return answer;
}
