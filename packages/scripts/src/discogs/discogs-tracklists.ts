import type { Document } from 'yaml';

import chalk from 'chalk';
import { readdirSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';

import type { DiscogsArtistCredit, DiscogsRelease, DiscogsTrack } from '#discogs/discogs-api.ts';

import { fetchRelease } from '#discogs/discogs-api.ts';

const reviewsPath = 'packages/content/collections/reviews';

const frontmatterFence = '---';

// `validate-content`'s `body-markers` fails an entry carrying `tracks` with no tag to render it
const trackListTag = '<TrackList tracks={frontmatter.tracks} />';

// Discogs disambiguates two artists of the same name with a trailing counter
const disambiguationPattern = /\s*\(\d+\)$/;

// A multi-disc release numbers its positions `<disc>-<index>`; every other shape stays flat
const discPositionPattern = /^(\d+)-\S/;

// A compilation credits the release to "Various", which must never fill down onto a track
const variousArtistsName = 'Various';

// Discogs' join words, written the way the hand-written Mixes write them; anything else lowercases
const joinWords: Record<string, string> = { '/': '&', featuring: 'feat.' };

interface Entry {
	body: string;
	document: Document;
}

interface GroupDraft {
	title: string;
	tracks: Array<TrackDraft>;
}

interface Target {
	entry: Entry;
	filePath: string;
	location: string;
	releaseId: number;
}

interface TrackDraft {
	artists: string;
	duration?: string;
	title: string;
}

export function toArtistName(credits: Array<DiscogsArtistCredit>): string {
	let name = '';

	for (const [index, credit] of credits.entries()) {
		name += credit.name.replace(disambiguationPattern, '');

		if (index < credits.length - 1) name += toJoinSeparator(credit.join);
	}

	return name;
}

// Round-tripping the document leaves every untouched key byte-identical, verified across the corpus
export function toEntry(source: string): Entry | undefined {
	const lines = source.split('\n');
	const fenceIndex = lines.indexOf(frontmatterFence, 1);

	if (fenceIndex === -1 || lines[0] !== frontmatterFence) return undefined;

	return {
		body: lines.slice(fenceIndex + 1).join('\n'),
		// Under YAML 1.1 a bare `4:14` parses as the sexagesimal integer 254, so durations self-quote
		document: parseDocument(`${lines.slice(1, fenceIndex).join('\n')}\n`, { version: '1.1' }),
	};
}

export function toSource(entry: Entry): string {
	const body = entry.body.includes('<TrackList')
		? entry.body
		: `${entry.body.replace(/\n+$/, '')}\n\n${trackListTag}\n`;

	return `${frontmatterFence}\n${String(entry.document)}${frontmatterFence}\n${body}`;
}

// Discogs carries no per-track label or year, so a track emits artists, title and duration only
export function toTracklist(
	release: DiscogsRelease,
	location: string,
	problems: Array<string>,
): Array<GroupDraft> | Array<TrackDraft> | undefined {
	const tracks = release.tracklist.filter((track) => track.type_ === 'track');

	if (tracks.length === 0) {
		problems.push(`${location}: release ${String(release.id)} has no tracks`);
		return undefined;
	}

	const releaseArtists = toArtistName(release.artists);
	const drafts: Array<TrackDraft> = [];

	for (const track of tracks) {
		const draft = toTrackDraft(track, releaseArtists, location, problems);

		if (!draft) return undefined;

		drafts.push(draft);
	}

	const groups = toGroups(tracks, drafts);

	return groups.length > 0 ? groups : drafts;
}

export async function writeDiscogsTracklists(rootPath: string, isDryRun: boolean): Promise<void> {
	const files = findReviewFiles(path.resolve(rootPath, reviewsPath));

	console.log(chalk.blue(`Reading ${String(files.length)} reviews...`));

	const problems: Array<string> = [];
	const { skipped, targets } = toTargets(files, rootPath, problems);
	let written = 0;

	for (const { entry, filePath, location, releaseId } of targets) {
		const tracklist = toTracklist(await fetchRelease(releaseId), location, problems);

		if (!tracklist) continue;

		entry.document.set('tracks', tracklist);
		written += 1;

		console.log(
			chalk.gray(
				`  ${location} ← release ${String(releaseId)}, ${String(toTrackCount(tracklist))} tracks`,
			),
		);

		if (!isDryRun) await fs.writeFile(filePath, toSource(entry), 'utf8');
	}

	for (const problem of problems) console.log(chalk.yellow(`  ${problem}`));

	const verb = isDryRun ? 'Would write' : 'Wrote';

	console.log(chalk.green(`${verb} ${String(written)} tracklists, skipped ${String(skipped)}`));
}

function findReviewFiles(directory: string): Array<string> {
	const files: Array<string> = [];
	const entries = readdirSync(directory, { withFileTypes: true });

	for (const entry of entries) {
		// Drafts carry the `_` prefix Astro's loader glob skips, so they are not published Reviews
		if (entry.name.startsWith('_')) continue;

		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) files.push(...findReviewFiles(entryPath));
		else if (entry.name.endsWith('.mdx')) files.push(entryPath);
	}

	return files.sort((first, second) => first.localeCompare(second));
}

// Only an all-`N-M` tracklist spanning two discs or more groups; every other shape stays flat
function toGroups(tracks: Array<DiscogsTrack>, drafts: Array<TrackDraft>): Array<GroupDraft> {
	const discs = tracks.map((track) => discPositionPattern.exec(track.position)?.[1]);

	if (discs.includes(undefined) || new Set(discs).size < 2) return [];

	const groups: Array<GroupDraft> = [];

	for (const [index, disc] of discs.entries()) {
		const title = `Disc ${String(disc)}`;
		const draft = drafts[index];

		if (!draft) continue;

		const last = groups.at(-1);

		if (last?.title === title) last.tracks.push(draft);
		else groups.push({ title, tracks: [draft] });
	}

	return groups;
}

// A trailing comma takes no space before it; every other join word is surrounded by one
function toJoinSeparator(join: string): string {
	const trimmed = join.trim().toLowerCase();

	if (trimmed === '' || trimmed === ',') return ', ';

	return ` ${joinWords[trimmed] ?? trimmed} `;
}

// `discogsReleaseId` is the gate: a Review earns a tracklist by naming the release it came from
function toTargets(
	files: Array<string>,
	rootPath: string,
	problems: Array<string>,
): { skipped: number; targets: Array<Target> } {
	const targets: Array<Target> = [];
	let skipped = 0;

	for (const filePath of files) {
		const location = path.relative(rootPath, filePath);
		const entry = toEntry(readFileSync(filePath, 'utf8'));

		if (!entry) {
			problems.push(`${location}: no closing frontmatter fence`);
			continue;
		}

		const releaseId = entry.document.get('discogsReleaseId');

		if (typeof releaseId !== 'number') continue;

		// Once written, the frontmatter is the record; delete the block to draw a fresh one
		if (entry.document.has('tracks')) skipped += 1;
		else targets.push({ entry, filePath, location, releaseId });
	}

	return { skipped, targets };
}

function toTrackCount(tracklist: Array<GroupDraft> | Array<TrackDraft>): number {
	const items: Array<GroupDraft | TrackDraft> = tracklist;

	return items.reduce((total, item) => total + ('tracks' in item ? item.tracks.length : 1), 0);
}

// Discogs credits per track on compilations only; others take the main credit for the release
function toTrackDraft(
	track: DiscogsTrack,
	releaseArtists: string,
	location: string,
	problems: Array<string>,
): TrackDraft | undefined {
	if (!track.title) {
		problems.push(`${location}: a track at position "${track.position}" has no title`);
		return undefined;
	}

	const artists = track.artists?.length ? toArtistName(track.artists) : releaseArtists;

	if (!artists || artists === variousArtistsName) {
		problems.push(`${location}: "${track.title}" has no artist to fill down from`);
		return undefined;
	}

	return { artists, title: track.title, ...(track.duration ? { duration: track.duration } : {}) };
}
