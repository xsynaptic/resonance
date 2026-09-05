export function formatClock(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

	const total = Math.floor(seconds);
	const minutes = Math.floor(total / 60);
	const remainder = total % 60;

	return `${String(minutes)}:${String(remainder).padStart(2, '0')}`;
}
