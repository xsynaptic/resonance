import { z } from 'zod';

const timestampPattern = /^(\d{2}):([0-5]\d):([0-5]\d)\.(\d{2})$/;

// The fraction is hundredths of a second, not CD frames; only the emitted cue sheet speaks frames
// Cue points drive seeking, so a bad shape is a build error rather than a warning
export const TimestampSchema = z.string().regex(timestampPattern, {
	message: 'Use HH:MM:SS.dd, where dd is hundredths of a second',
});

export function parseTimestampSeconds(timestamp: string): number | undefined {
	const match = timestampPattern.exec(timestamp);

	if (!match) return undefined;

	const [, hours = '0', minutes = '0', seconds = '0', hundredths = '0'] = match;

	return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(hundredths) / 100;
}
