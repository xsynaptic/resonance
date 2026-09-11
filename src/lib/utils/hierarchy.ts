export interface Hierarchy {
	// Nearest-first, self-exclusive; last element is the root
	ancestorsOf(id: string): ReadonlyArray<string>;
	// Direct children, id-sorted, [] if none
	childrenOf(id: string): ReadonlyArray<string>;
	// Deepest node whose subtree spans every id (self-inclusive); undefined if they share no root
	commonAncestorOf(ids: Array<string>): string | undefined;
	depthOf(id: string): number;
	// Preorder, self-exclusive
	descendantsOf(id: string): ReadonlyArray<string>;
	has(id: string): boolean;
	// Nested-set interval per node; a subtree filter reads its own interval
	intervalById: ReadonlyMap<string, [number, number]>;
	// Interval containment; self-inclusive (a node is within its own interval)
	isDescendantOf(id: string, ancestorId: string): boolean;
	// Preorder ordinal per node; subtree membership tests read this
	ordinalById: ReadonlyMap<string, number>;
	parentOf(id: string): string | undefined;
	roots: ReadonlyArray<string>;
	// Same-parent minus self, id-sorted
	siblingsOf(id: string): ReadonlyArray<string>;
}

export interface HierarchyNode {
	id: string;
	parentId?: string;
}

const byId = (idA: string, idB: string): number => idA.localeCompare(idB);

interface HierarchyEdges {
	childrenByParent: Map<string, Array<string>>;
	idSet: Set<string>;
	parentById: Map<string, string>;
	roots: Array<string>;
}

interface HierarchyIndex {
	depthById: Map<string, number>;
	descendantsById: Map<string, Array<string>>;
	intervalById: Map<string, [number, number]>;
	ordinalById: Map<string, number>;
}

export function createHierarchy(nodes: Array<HierarchyNode>): Hierarchy {
	const { childrenByParent, idSet, parentById, roots } = buildEdges(nodes);
	const { depthById, descendantsById, intervalById, ordinalById } = indexTree({
		childrenByParent,
		roots,
	});

	function ancestorsOf(id: string): Array<string> {
		const ancestors: Array<string> = [];
		const seen = new Set<string>([id]);
		let current = parentById.get(id);

		while (current !== undefined && !seen.has(current)) {
			ancestors.push(current);
			seen.add(current);
			current = parentById.get(current);
		}
		return ancestors;
	}

	function siblingsOf(id: string): Array<string> {
		const parent = parentById.get(id);
		const group = parent === undefined ? roots : (childrenByParent.get(parent) ?? []);

		return group.filter((siblingId) => siblingId !== id);
	}

	function isDescendantOf(id: string, ancestorId: string): boolean {
		const interval = intervalById.get(ancestorId);
		const ordinal = ordinalById.get(id);

		if (!interval || ordinal === undefined) return false;
		return ordinal >= interval[0] && ordinal <= interval[1];
	}

	function commonAncestorOf(ids: Array<string>): string | undefined {
		const known = ids.filter((id) => idSet.has(id));
		const first = known[0];

		if (first === undefined) return undefined;

		// Any common ancestor must span `first`, so it lies on its self-inclusive path; nearest-first wins
		for (const candidate of [first, ...ancestorsOf(first)]) {
			const interval = intervalById.get(candidate)!;
			const isSpansAll = known.every((id) => {
				const ordinal = ordinalById.get(id)!;
				return ordinal >= interval[0] && ordinal <= interval[1];
			});
			if (isSpansAll) return candidate;
		}
		return undefined;
	}

	return {
		ancestorsOf,
		childrenOf: (id) => childrenByParent.get(id) ?? [],
		commonAncestorOf,
		depthOf: (id) => depthById.get(id) ?? 0,
		descendantsOf: (id) => descendantsById.get(id) ?? [],
		has: (id) => idSet.has(id),
		intervalById,
		isDescendantOf,
		ordinalById,
		parentOf: (id) => parentById.get(id),
		roots,
		siblingsOf,
	};
}

// A missing, dangling, or self parent makes a root
function buildEdges(nodes: Array<HierarchyNode>): HierarchyEdges {
	const idSet = new Set(nodes.map((node) => node.id));
	const parentById = new Map<string, string>();
	const childrenByParent = new Map<string, Array<string>>();
	const roots: Array<string> = [];

	for (const node of nodes) {
		const { id, parentId } = node;

		if (parentId === undefined || parentId === id || !idSet.has(parentId)) {
			roots.push(id);
			continue;
		}

		parentById.set(id, parentId);

		const siblings = childrenByParent.get(parentId);
		if (siblings) {
			siblings.push(id);
		} else {
			childrenByParent.set(parentId, [id]);
		}
	}

	roots.sort(byId);

	for (const siblings of childrenByParent.values()) {
		siblings.sort(byId);
	}

	return { childrenByParent, idSet, parentById, roots };
}

// Preorder walk assigning each node a nested-set interval, so subtree tests are two comparisons
function indexTree(edges: Pick<HierarchyEdges, 'childrenByParent' | 'roots'>): HierarchyIndex {
	const ordinalById = new Map<string, number>();
	const intervalById = new Map<string, [number, number]>();
	const depthById = new Map<string, number>();
	const descendantsById = new Map<string, Array<string>>();
	const visited = new Set<string>();

	let counter = 1;

	function visit(id: string, depth: number): Array<string> {
		if (visited.has(id)) return []; // Defensive against malformed cycles

		visited.add(id);

		const left = counter;

		counter += 1;
		ordinalById.set(id, left);
		depthById.set(id, depth);

		const descendants: Array<string> = [];
		const children = edges.childrenByParent.get(id) ?? [];

		for (const childId of children) {
			descendants.push(childId, ...visit(childId, depth + 1));
		}
		descendantsById.set(id, descendants);

		const right = counter;

		counter += 1;
		intervalById.set(id, [left, right]);

		return descendants;
	}

	for (const rootId of edges.roots) {
		visit(rootId, 0);
	}

	return { depthById, descendantsById, intervalById, ordinalById };
}
