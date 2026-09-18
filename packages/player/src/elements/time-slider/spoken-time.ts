import { formatClock, formatTemplate } from '#lib/format.ts';

// The slider speaks a new position every second, so the formatters are built once
let durationFormats: Record<'always' | 'auto', Intl.DurationFormat> | undefined;

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
	if (durationFormats === undefined) {
		durationFormats = {
			always: new Intl.DurationFormat(locale, { secondsDisplay: 'always', style: 'long' }),
			auto: new Intl.DurationFormat(locale, { secondsDisplay: 'auto', style: 'long' }),
		};
	}

	return durationFormats[secondsDisplay];
}

function formatSpokenDuration(seconds: number, locale: string | undefined): string {
	const total = Math.max(0, Math.floor(seconds));

	// Not in every engine; without it the clock string is spoken instead
	if (!('DurationFormat' in Intl)) return formatClock(total);

	// Every unit hides at zero by default, which would speak nothing at the start of a track
	const format = durationFormat(locale, total === 0 ? 'always' : 'auto');

	return format.format({
		hours: Math.floor(total / 3600),
		minutes: Math.floor(total / 60) % 60,
		seconds: total % 60,
	});
}
