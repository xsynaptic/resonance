import type { PlayerTimeMode } from '#types.ts';

// A negative value is the remaining-time idiom, so the sign is part of the format rather than a rejected input
export function formatClock(seconds: number): string {
	if (!Number.isFinite(seconds)) return '0:00';

	const total = Math.floor(Math.abs(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor(total / 60) % 60;
	const remainder = String(total % 60).padStart(2, '0');
	const sign = seconds < 0 ? '-' : '';

	if (hours === 0) return `${sign}${String(minutes)}:${remainder}`;

	return `${sign}${String(hours)}:${String(minutes).padStart(2, '0')}:${remainder}`;
}

export function formatModeClock(
	seconds: number,
	{ durationSeconds, timeMode }: { durationSeconds: number | undefined; timeMode: PlayerTimeMode },
): string {
	if (timeMode === 'remaining' && durationSeconds !== undefined) {
		return formatClock(seconds - durationSeconds);
	}

	return formatClock(seconds);
}

export function formatTemplate(template: string, values: Record<string, number | string>): string {
	return template.replaceAll(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}
