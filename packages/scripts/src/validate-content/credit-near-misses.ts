import { toSlug } from '@xsynaptic/shared/routing';

import type { ContentEntry } from '#shared/astro-content.ts';
import type { ValidationIssue, ValidationResult } from '#validate-content/validation-result.ts';

import { collectEntryCredits } from '#validate-content/credits.ts';

// Distance 2 flagged only false positives across the real content
const nearMissDistance = 1;

// Short slugs sit one letter from too many others to be meaningful
const minimumSlugLength = 4;

// A misspelled credit renders unlinked; this only warns, since a real Label can sit one letter from a cataloged one
export function validateCreditNearMisses(
	entries: Array<ContentEntry>,
	catalog: Array<ContentEntry>,
): ValidationResult {
	const slugsByCollection = getTermSlugsByCollection(catalog);

	const issues = entries.flatMap((entry) => collectNearMisses(entry, slugsByCollection));

	if (issues.length === 0) return { issues, status: 'pass', summary: 'No near-miss credits' };

	return {
		issues,
		status: 'warn',
		summary: `Found ${issues.length.toString()} free-text credit(s) one letter off a Term`,
	};
}

function collectNearMisses(entry: ContentEntry, slugsByCollection: Map<string, Set<string>>) {
	const issues: Array<ValidationIssue> = [];

	for (const { collection, field, value } of collectEntryCredits(entry)) {
		const termSlugs = slugsByCollection.get(collection) ?? new Set<string>();

		for (const name of toFreeTextNames(value)) {
			const nearMiss = findNearMiss(toSlug(name), termSlugs);

			if (!nearMiss) continue;

			issues.push({
				message: `${entry.filePath ?? entry.id}: ${field} "${name}" is one letter off ${collection} "${nearMiss}"`,
			});
		}
	}

	return issues;
}

function findNearMiss(slug: string, termSlugs: Set<string>) {
	if (slug.length < minimumSlugLength || termSlugs.has(slug)) return;

	return [...termSlugs].find((termSlug) => getEditDistance(slug, termSlug) === nearMissDistance);
}

function getEditDistance(first: string, second: string) {
	if (Math.abs(first.length - second.length) > nearMissDistance) return Infinity;

	let previous = Array.from({ length: second.length + 1 }, (_, index) => index);

	for (const firstCharacter of first) {
		const current = [previous[0]! + 1];

		for (const secondCharacter of second) {
			const column = current.length;
			const cost = firstCharacter === secondCharacter ? 0 : 1;

			current.push(
				Math.min(previous[column]! + 1, current[column - 1]! + 1, previous[column - 1]! + cost),
			);
		}

		previous = current;
	}

	return previous[second.length]!;
}

// A bare string links when its slug matches a Term's id or its slugified title
function getTermSlugsByCollection(catalog: Array<ContentEntry>) {
	const slugsByCollection = new Map<string, Set<string>>();

	for (const entry of catalog) {
		const slugs = slugsByCollection.get(entry.collection) ?? new Set<string>();

		slugs.add(entry.id);
		if (typeof entry.data.title === 'string') slugs.add(toSlug(entry.data.title));
		slugsByCollection.set(entry.collection, slugs);
	}

	return slugsByCollection;
}

function toFreeTextNames(value: unknown): Array<string> {
	const values: Array<unknown> = Array.isArray(value) ? (value as Array<unknown>) : [value];

	return values.filter((item) => typeof item === 'string');
}
