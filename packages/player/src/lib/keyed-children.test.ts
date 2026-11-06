import { fc, test } from '@fast-check/vitest';
import { afterEach, describe, expect, vi } from 'vitest';

import { keyedChildren } from '#lib/keyed-children.ts';

function renderList() {
	const list = document.createElement('ul');
	const created: Array<string> = [];
	const reconcile = keyedChildren<string, { node: HTMLLIElement }>(list, {
		create: (item) => {
			const node = document.createElement('li');

			node.tabIndex = -1;
			created.push(item);

			return { node };
		},
		key: (item) => item,
		update: ({ node }, item) => {
			node.textContent = item;
		},
	});

	document.body.append(list);

	return { created, list, reconcile };
}

// As Chrome's does, it refuses a node that is not yet in the document
function stubMoveBefore(list: HTMLElement) {
	const moveBefore = vi.fn((node: Element, child: Element | null) => {
		if (!node.isConnected) throw new DOMException('Not connected', 'HierarchyRequestError');

		if (child) child.before(node);
		else list.append(node);
	});

	Object.assign(list, { moveBefore });

	return moveBefore;
}

function rowsOf(list: HTMLElement): Array<HTMLLIElement> {
	return [...list.querySelectorAll('li')];
}

const smallKeyPool = ['a', 'b', 'c', 'd', 'e'];

const uniqueKeysStampedByTheQueue = fc.uniqueArray(fc.constantFrom(...smallKeyPool), {
	maxLength: smallKeyPool.length,
});

const reconcileSteps = fc.array(
	fc.record(
		{ focusIndex: fc.nat({ max: smallKeyPool.length - 1 }), items: uniqueKeysStampedByTheQueue },
		{ noNullPrototype: true },
	),
	{ maxLength: 40, minLength: 1, size: 'max' },
);

afterEach(() => {
	document.body.replaceChildren();
});

describe('keyedChildren', () => {
	test('keeps each node through a reorder, creating and removing only what changed', () => {
		const { created, list, reconcile } = renderList();

		reconcile(['a', 'b', 'c']);

		const [a, b] = rowsOf(list);

		reconcile(['b', 'd', 'a']);

		const rows = rowsOf(list);

		expect(rows.map((row) => row.textContent)).toStrictEqual(['b', 'd', 'a']);
		expect(rows[0]).toBe(b);
		expect(rows[2]).toBe(a);
		expect(created).toStrictEqual(['a', 'b', 'c', 'd']);
	});

	test('moves a node already in the document with moveBefore, and inserts a new one', () => {
		const { list, reconcile } = renderList();

		reconcile(['a', 'b']);

		const moveBefore = stubMoveBefore(list);

		reconcile(['c', 'b', 'a']);

		const [, b, a] = rowsOf(list);

		expect(rowsOf(list).map((row) => row.textContent)).toStrictEqual(['c', 'b', 'a']);
		expect(moveBefore).toHaveBeenCalledOnce();
		expect(moveBefore).toHaveBeenCalledWith(b, a);
	});

	test('hands focus back to a focused node that a move without moveBefore blurred', () => {
		const { list, reconcile } = renderList();

		reconcile(['a', 'b']);

		const [, b] = rowsOf(list);

		b?.focus();
		reconcile(['b', 'a']);

		expect(document.activeElement).toBe(b);
	});

	test.prop([reconcileSteps, fc.boolean()])(
		'matches the items in order after every reconcile, keeping each surviving node and its focus',
		(steps, hasMoveBefore) => {
			const { list, reconcile } = renderList();

			if (hasMoveBefore) stubMoveBefore(list);

			for (const { focusIndex, items } of steps) {
				const before = new Map(rowsOf(list).map((row) => [row.textContent, row] as const));
				const focused = rowsOf(list)[focusIndex];

				focused?.focus();
				reconcile(items);

				const rows = rowsOf(list);

				expect(rows.map((row) => row.textContent)).toStrictEqual(items);

				for (const row of rows) {
					const previous = before.get(row.textContent);

					if (previous) expect(row).toBe(previous);
				}

				if (focused && items.includes(focused.textContent)) {
					expect(document.activeElement).toBe(focused);
				}
			}

			document.body.replaceChildren();
		},
	);
});
