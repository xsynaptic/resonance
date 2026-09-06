// A negative value is the remaining-time idiom, so the sign is part of the format rather than a rejected input
export function formatClock(seconds: number): string {
	if (!Number.isFinite(seconds)) return '0:00';

	const total = Math.floor(Math.abs(seconds));
	const minutes = Math.floor(total / 60);
	const remainder = total % 60;
	const sign = seconds < 0 ? '-' : '';

	return `${sign}${String(minutes)}:${String(remainder).padStart(2, '0')}`;
}

export function formatTemplate(template: string, values: Record<string, number | string>): string {
	return template.replaceAll(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}
