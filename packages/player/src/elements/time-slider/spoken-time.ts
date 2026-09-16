import { formatClock, formatTemplate } from '#lib/format.ts';

// Kept per locale and seconds setting, since the slider speaks a new position every second
const durationFormats = new Map<string, Intl.DurationFormat>();

export function formatSpokenPosition(
	template: string,
	currentSeconds: number,
	durationSeconds: number | undefined,
): string {
	// The page's language rather than the browser's, so the units agree with the labels around them
	const locale = document.documentElement.lang || undefined;
	const current = formatSpokenDuration(currentSeconds, locale);
	if (durationSeconds === undefined) return current;

	return formatTemplate(template, {
		current,
		duration: formatSpokenDuration(durationSeconds, locale),
	});
}

function durationFormat(
	locale: string | undefined,
	secondsDisplay: 'always' | 'auto',
): Intl.DurationFormat {
	const key = `${locale ?? ''}:${secondsDisplay}`;
	const cached = durationFormats.get(key);
	if (cached) return cached;

	const format = new Intl.DurationFormat(locale, { secondsDisplay, style: 'long' });

	durationFormats.set(key, format);

	return format;
}

function formatSpokenDuration(seconds: number, locale: string | undefined): string {
	const total = Math.max(0, Math.floor(seconds));

	// Baseline since 2025; an engine without it speaks the clock string instead
	if (!('DurationFormat' in Intl)) return formatClock(total);

	// Every unit hides at zero by default, which would speak nothing at the start of a track
	const format = durationFormat(locale, total === 0 ? 'always' : 'auto');

	return format.format({
		hours: Math.floor(total / 3600),
		minutes: Math.floor(total / 60) % 60,
		seconds: total % 60,
	});
}
