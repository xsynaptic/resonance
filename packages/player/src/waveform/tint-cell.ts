import type { SonicWaveform } from '@xsynaptic/sonic-ui';

// sonic-ui takes the cell as attributes; it rides on tokens here so the look lives in one stylesheet
// Read once at connect, so a stylesheet change lands with the next surface
const cellTokens = [
	['tint-hue', '--player-tint-hue'],
	['tint-dynamics', '--player-tint-dynamics'],
] as const;

export function applyTintCell(control: SonicWaveform): void {
	const styles = getComputedStyle(control);

	for (const [attribute, token] of cellTokens) {
		const value = styles.getPropertyValue(token).trim();

		if (value === '' || value === 'none') {
			control.removeAttribute(attribute);
			continue;
		}

		control.setAttribute(attribute, value);
	}
}
