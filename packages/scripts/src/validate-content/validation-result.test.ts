import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { reportValidationResult, toValidationResult } from '#validate-content/validation-result.ts';

describe('toValidationResult', () => {
	test('passes with the pass summary when nothing is flagged', () => {
		expect(toValidationResult([], { fail: 'Found 0 problem(s)', pass: 'all good' })).toEqual({
			issues: [],
			status: 'pass',
			summary: 'all good',
		});
	});

	test('fails with the fail summary and keeps the issues', () => {
		const issues = [{ message: 'a-mix: broken' }];

		expect(toValidationResult(issues, { fail: 'Found 1 problem(s)', pass: 'all good' })).toEqual({
			issues,
			status: 'fail',
			summary: 'Found 1 problem(s)',
		});
	});
});

describe('reportValidationResult', () => {
	// Chalk strips its own styling under vitest, so the lines compare as plain text
	const lines: Array<string> = [];

	beforeEach(() => {
		lines.length = 0;
		vi.spyOn(console, 'log').mockImplementation((line: string) => {
			lines.push(line);
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('prints the pass summary, then any notes', () => {
		reportValidationResult({
			issues: [],
			notes: ['   26 carry timestamps'],
			status: 'pass',
			summary: '68 mixes checked',
		});

		expect(lines).toEqual(['✓ 68 mixes checked', '   26 carry timestamps']);
	});

	test('prints issues above the summary, with details indented', () => {
		reportValidationResult({
			issues: [{ details: ['Line 3: broken link ID "missing"'], message: 'a-post.mdx' }],
			status: 'fail',
			summary: 'Found 1 broken link ID(s)',
		});

		expect(lines).toEqual([
			'❌ a-post.mdx',
			'   Line 3: broken link ID "missing"',
			'⚠️  Found 1 broken link ID(s)',
		]);
	});

	test('marks advisory issues as warnings', () => {
		reportValidationResult({
			issues: [{ message: 'shpongle: members lists "simon-posford"' }],
			status: 'warn',
			summary: 'Found 1 one-sided artist relation(s)',
		});

		expect(lines).toEqual([
			'⚠️  shpongle: members lists "simon-posford"',
			'⚠️  Found 1 one-sided artist relation(s)',
		]);
	});
});
