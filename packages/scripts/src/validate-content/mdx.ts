import type { ContentEntry } from '../shared/astro-content.js';
import type { ValidationIssue } from './validation-result.js';

import { toValidationResult } from './validation-result.js';

// A required prop missing here throws while the component renders, naming only the page path
const requiredProps = [
	{ prop: 'id', tag: 'Link' },
	{ prop: 'src', tag: 'Img' },
] as const;

interface ComponentIssue {
	context: string;
	lineNumber: number;
	message: string;
}

export function collectComponentIssues(body: string): Array<ComponentIssue> {
	const lines = body.split('\n');

	return requiredProps
		.flatMap(({ prop, tag }) => collectTagIssues(body, lines, tag, prop))
		.sort((first, second) => first.lineNumber - second.lineNumber);
}

export function validateMdxComponents(entries: Array<ContentEntry>) {
	const issues: Array<ValidationIssue> = [];

	let issueCount = 0;

	for (const entry of entries) {
		if (!entry.body) continue;

		const componentIssues = collectComponentIssues(entry.body);

		if (componentIssues.length === 0) continue;

		issues.push({
			details: componentIssues.flatMap((issue) => [
				`Line ${issue.lineNumber.toString()}: ${issue.message}`,
				issue.context,
			]),
			message: entry.filePath ?? entry.id,
		});

		issueCount += componentIssues.length;
	}

	return toValidationResult(issues, {
		fail: `Found ${issueCount.toString()} invalid component(s)`,
		pass: 'MDX components valid',
	});
}

function collectTagIssues(
	body: string,
	lines: Array<string>,
	tag: string,
	prop: string,
): Array<ComponentIssue> {
	const tagRegex = new RegExp(String.raw`<${tag}(\s[^>]*?)?/?>`, 'g');
	const propRegex = new RegExp(String.raw`(^|\s)${prop}=["'][^"']+["']`);

	const issues: Array<ComponentIssue> = [];

	for (const match of body.matchAll(tagRegex)) {
		if (propRegex.test(match[1] ?? '')) continue;

		const lineNumber = body.slice(0, match.index).split('\n').length;

		issues.push({
			context: lines[lineNumber - 1]?.trim() ?? '',
			lineNumber,
			message: `${tag} component missing ${prop} prop`,
		});
	}

	return issues;
}
