import { afterEach, describe, expect, test, vi } from 'vitest';

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

function rowsOf(list: HTMLElement): Array<HTMLLIElement> {
	return [...list.querySelectorAll('li')];
}

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

		// As Chrome's does, it refuses a node that is not yet in the document
		const moveBefore = vi.fn((node: Element, child: Element | null) => {
			if (!node.isConnected) throw new DOMException('Not connected', 'HierarchyRequestError');

			if (child) child.before(node);
			else list.append(node);
		});

		Object.assign(list, { moveBefore });
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
});
