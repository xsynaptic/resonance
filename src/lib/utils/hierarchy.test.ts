import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import type { HierarchyNode } from '#lib/utils/hierarchy.ts';

import { createHierarchy } from '#lib/utils/hierarchy.ts';

const termId = (index: number) => `term-${String(index)}`;

const byId = (left: string, right: string) => left.localeCompare(right);

// Astro gives every entry in a collection its own id, so ids are unique by construction
function toNodes(parents: Array<'missing' | number | undefined>): Array<HierarchyNode> {
	return parents.map((parent, index) => {
		if (parent === undefined) return { id: termId(index) };

		return { id: termId(index), parentId: parent === 'missing' ? 'missing' : termId(parent) };
	});
}

const shuffled = (nodes: Array<HierarchyNode>) =>
	fc.shuffledSubarray(nodes, { maxLength: nodes.length, minLength: nodes.length });

// Hand-edited content can name any term as a parent, so nothing keeps these acyclic
const anyParentTerms = fc
	.integer({ max: 8, min: 1 })
	.chain((count) =>
		fc.array(
			fc.oneof(
				fc.constant(undefined),
				fc.constant('missing' as const),
				fc.integer({ max: count - 1, min: 0 }),
			),
			{ maxLength: count, minLength: count },
		),
	)
	.map(toNodes)
	.chain(shuffled);

const acyclicParentTerms = fc
	.array(fc.option(fc.nat(), { nil: undefined }), { maxLength: 12, minLength: 1 })
	.map((parents) =>
		toNodes(
			parents.map((parent, index) =>
				parent === undefined || index === 0 ? undefined : parent % index,
			),
		),
	)
	.chain(shuffled);

// Read from the content directly, so it cannot share a mistake with the code under test
function statedAncestors(
	nodes: Array<HierarchyNode>,
	id: string,
): 'loop' | 'missing' | Array<string> {
	const parentById = new Map(nodes.map((node) => [node.id, node.parentId]));
	const chain: Array<string> = [];

	for (let current = parentById.get(id); current !== undefined; current = parentById.get(current)) {
		if (!parentById.has(current)) return 'missing';
		if (current === id || chain.includes(current)) return 'loop';

		chain.push(current);
	}

	return chain;
}

// root-a > { child-a > grandchild, child-b }, plus a separate root-b
const nodes: Array<HierarchyNode> = [
	{ id: 'root-a' },
	{ id: 'child-a', parentId: 'root-a' },
	{ id: 'child-b', parentId: 'root-a' },
	{ id: 'grandchild', parentId: 'child-a' },
	{ id: 'root-b' },
];

describe('createHierarchy nested-set numbering', () => {
	const { intervalById, ordinalById } = createHierarchy(nodes);

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

	test('a parent that does not exist throws, naming both ids', () => {
		expect(() => createHierarchy([{ id: 'orphan', parentId: 'missing' }])).toThrow(
			'"orphan" has a parent "missing" that does not exist!',
		);
	});

	test.each([
		{ name: 'its own parent', nodes: [{ id: 'loop', parentId: 'loop' }], trail: 'loop > loop' },
		{
			name: 'a longer loop',
			nodes: [
				{ id: 'root' },
				{ id: 'north', parentId: 'south' },
				{ id: 'south', parentId: 'north' },
			],
			trail: 'north > south > north',
		},
	])('a node that is $name throws, naming the loop', ({ nodes, trail }) => {
		expect(() => createHierarchy(nodes)).toThrow(`parents form a loop: ${trail}!`);
	});

	test.prop([anyParentTerms])(
		'every term takes one place in the tree, unless a parent is missing or loops',
		(terms) => {
			const isRefused = terms.some((term) => !Array.isArray(statedAncestors(terms, term.id)));

			if (isRefused) {
				expect(() => createHierarchy(terms)).toThrow(/does not exist|parents form a loop/);
				return;
			}

			const { intervalById, ordinalById } = createHierarchy(terms);
			const places = [...intervalById.values()].flat();

			expect([...ordinalById.keys()].toSorted(byId)).toStrictEqual(
				terms.map((term) => term.id).toSorted(byId),
			);
			expect(new Set(places).size).toBe(2 * terms.length);
		},
	);
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

	test.prop([acyclicParentTerms, fc.uniqueArray(fc.nat(), { maxLength: 3, minLength: 1 })])(
		'a term sits inside another exactly when the content names that one somewhere up its chain',
		(terms, picks) => {
			const tree = createHierarchy(terms);
			const ids = terms.map((term) => term.id);
			const chainOf = (id: string) => {
				const stated = statedAncestors(terms, id);
				if (stated === 'loop' || stated === 'missing')
					throw new Error(`The generator built a ${stated} parent at ${id}`);

				return stated;
			};

			for (const id of ids) {
				expect(tree.ancestorsOf(id)).toStrictEqual(chainOf(id));
				expect(tree.depthOf(id)).toBe(chainOf(id).length);

				for (const ancestorId of ids) {
					expect(tree.isDescendantOf(id, ancestorId)).toBe(
						id === ancestorId || chainOf(id).includes(ancestorId),
					);
				}

				expect(new Set(tree.descendantsOf(id))).toStrictEqual(
					new Set(ids.filter((other) => other !== id && chainOf(other).includes(id))),
				);
			}

			const [first = '', ...rest] = picks.map((pick) => ids[pick % ids.length] ?? '');
			const shared = [first, ...chainOf(first)].find((candidate) =>
				rest.every((id) => id === candidate || chainOf(id).includes(candidate)),
			);

			expect(tree.commonAncestorOf([first, ...rest])).toBe(shared);
		},
	);
});
