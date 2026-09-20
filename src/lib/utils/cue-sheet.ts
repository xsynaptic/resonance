import { parseTimestampSeconds } from '@xsynaptic/shared/schemas';

// A cue sheet is a seek index for a long mix: a header, then one TRACK entry per timestamped track
// Pure string work, no content imports, so the format is testable on its own
// Callers supply the tracklist as-is; entries without a usable timestamp are dropped here

const framesPerSecond = 75;

interface CueSheetInput {
	date?: string | undefined;
	fileName: string;
	performer?: string | undefined;
	title?: string | undefined;
	tracks: Array<CueSheetTrack>;
}

interface CueSheetTrack {
	performer?: string | undefined;
	timestamp?: string | undefined;
	title: string;
}

// Long mixes exceed a CD, so MM and the track counter both run past their two-digit ceiling
// Players read these as plain integers; only CD-burning tools object
// An eight-hour set was never burnable anyway
export function buildCueSheet({ date, fileName, performer, title, tracks }: CueSheetInput): string {
	const lines = [
		...(performer ? [`PERFORMER ${quote(performer)}`] : []),
		...(title ? [`TITLE ${quote(title)}`] : []),
		...(date ? [`DATE ${date}`] : []),
		`FILE ${quote(fileName)} ${getFileFormat(fileName)}`,
	];

	let trackNumber = 0;

	for (const track of tracks) {
		const index = track.timestamp === undefined ? undefined : formatCueTime(track.timestamp);
		if (index === undefined) continue;

		trackNumber += 1;

		lines.push(
			`  TRACK ${String(trackNumber).padStart(2, '0')} AUDIO`,
			...(track.performer ? [`    PERFORMER ${quote(track.performer)}`] : []),
			`    TITLE ${quote(track.title)}`,
			`    INDEX 01 ${index}`,
		);
	}

	return `${lines.join('\r\n')}\r\n`;
}

// Cue time is MM:SS:FF with no hours field and frames at 75/second, so hours fold into minutes
function formatCueTime(timestamp: string): string | undefined {
	const parsed = parseTimestampSeconds(timestamp);

	if (parsed === undefined) return undefined;

	// Rounding recovers the exact hundredths; the raw float leaves `.24` a frame short
	const hundredths = Math.round(parsed * 100);
	const total = Math.floor(hundredths / 100);
	const frames = Math.floor(((hundredths % 100) * framesPerSecond) / 100);

	return [Math.floor(total / 60), total % 60, frames]
		.map((part) => String(part).padStart(2, '0'))
		.join(':');
}

// The format has no FLAC token; players sniff the audio file rather than trusting this declaration
function getFileFormat(fileName: string): string {
	return fileName.toLowerCase().endsWith('.mp3') ? 'MP3' : 'WAVE';
}

// Quoted fields have no escape mechanism, so an embedded double quote can only be dropped
function quote(value: string): string {
	return `"${value.replaceAll('"', '')}"`;
}
