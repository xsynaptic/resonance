import { formatClock } from '@xsynaptic/sonic-ui';

import type { PlayerTimeMode } from '#types.ts';

export function formatModeClock(
	seconds: number,
	{ durationSeconds, timeMode }: { durationSeconds: number | undefined; timeMode: PlayerTimeMode },
): string {
	if (timeMode === 'remaining' && durationSeconds !== undefined) {
		return formatClock(Math.min(0, Math.floor(seconds) - Math.floor(durationSeconds)));
	}

	return formatClock(seconds);
}

export function formatTemplate(template: string, values: Record<string, number | string>): string {
	return template.replaceAll(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}
