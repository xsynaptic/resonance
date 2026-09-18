import { describe, expect, test } from 'vitest';

import type { HierarchyNode } from '#lib/utils/hierarchy.ts';

import { createHierarchy } from '#lib/utils/hierarchy.ts';

// root-a > { child-a > grandchild, child-b }, plus a separate root-b
const nodes: Array<HierarchyNode> = [
	{ id: 'root-a' },
	{ id: 'child-a', parentId: 'root-a' },
	{ id: 'child-b', parentId: 'root-a' },
	{ id: 'grandchild', parentId: 'child-a' },
	{ id: 'root-b' },
];

describe('createHierarchy nested-set numbering', () => {
	const tree = createHierarchy(nodes);
	const { intervalById, ordinalById } = tree;

	test('numbering is deterministic regardless of input order', () => {
		const again = createHierarchy(nodes.toReversed());

		for (const id of ['root-a', 'child-a', 'child-b', 'grandchild', 'root-b']) {
			expect(again.ordinalById.get(id)).toBe(ordinalById.get(id));
			expect(again.intervalById.get(id)).toStrictEqual(intervalById.get(id));
		}
	});
});

describe('createHierarchy adjacency', () => {
	const tree = createHierarchy(nodes);

	test('ancestorsOf is nearest-first and self-exclusive, so .at(-1) is the root', () => {
		expect(tree.ancestorsOf('grandchild')).toStrictEqual(['child-a', 'root-a']);
		expect(tree.ancestorsOf('root-a')).toStrictEqual([]); // a root has none
	});

	test('siblingsOf excludes self', () => {
		expect(tree.siblingsOf('child-a')).toStrictEqual(['child-b']);
		expect(tree.siblingsOf('root-a')).toStrictEqual(['root-b']);
		expect(tree.siblingsOf('grandchild')).toStrictEqual([]);
	});

	test('descendantsOf is self-exclusive and matches subtree membership', () => {
		expect(new Set(tree.descendantsOf('root-a'))).toStrictEqual(
			new Set(['child-a', 'child-b', 'grandchild']),
		);
		expect(tree.descendantsOf('grandchild')).toStrictEqual([]);
	});

	test('malformed parents are tolerated: dangling and self references become roots', () => {
		const malformed = createHierarchy([
			{ id: 'orphan', parentId: 'missing' },
			{ id: 'child', parentId: 'orphan' },
			{ id: 'loop', parentId: 'loop' },
		]);

		expect(malformed.roots).toStrictEqual(['loop', 'orphan']);
		expect(malformed.parentOf('orphan')).toBeUndefined();
		expect(malformed.ancestorsOf('child')).toStrictEqual(['orphan']);
		expect(malformed.ancestorsOf('loop')).toStrictEqual([]);
	});
});

describe('createHierarchy containment queries', () => {
	const tree = createHierarchy(nodes);

	test('isDescendantOf reflects subtree containment', () => {
		expect(tree.isDescendantOf('grandchild', 'root-a')).toBe(true);
		expect(tree.isDescendantOf('grandchild', 'child-a')).toBe(true);
		expect(tree.isDescendantOf('child-b', 'child-a')).toBe(false);
		expect(tree.isDescendantOf('root-a', 'root-b')).toBe(false);
		expect(tree.isDescendantOf('nope', 'root-a')).toBe(false);
	});

	test('commonAncestorOf returns the deepest spanning node', () => {
		expect(tree.commonAncestorOf(['grandchild', 'child-b'])).toBe('root-a');
		expect(tree.commonAncestorOf(['grandchild', 'child-a'])).toBe('child-a');
		expect(tree.commonAncestorOf(['grandchild'])).toBe('grandchild');
	});

	test('commonAncestorOf handles disjoint, unknown, and empty inputs', () => {
		expect(tree.commonAncestorOf(['grandchild', 'root-b'])).toBeUndefined(); // no shared root
		expect(tree.commonAncestorOf(['grandchild', 'unknown'])).toBe('grandchild'); // unknown ignored
		expect(tree.commonAncestorOf(['unknown'])).toBeUndefined();
		expect(tree.commonAncestorOf([])).toBeUndefined();
	});
});
