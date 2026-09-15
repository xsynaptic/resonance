export interface KeyedChildren<Item, Child extends { node: Element }> {
	create: (item: Item) => Child;
	key: (item: Item) => string;
	update: (child: Child, item: Item) => void;
}

interface MovableParent extends Element {
	moveBefore: (node: Node, child: Node | null) => void;
}

// A node keeps its identity across a reorder, so what it holds (focus, a pointer capture) goes with it
export function keyedChildren<Item, Child extends { node: Element }>(
	parent: Element,
	children: KeyedChildren<Item, Child>,
): (items: ReadonlyArray<Item>) => void {
	let current = new Map<string, Child>();

	return (items) => {
		const next = new Map<string, Child>();

		for (const item of items) {
			const key = children.key(item);
			const child = current.get(key) ?? children.create(item);

			children.update(child, item);
			next.set(key, child);
		}

		for (const [key, child] of current) {
			if (!next.has(key)) child.node.remove();
		}

		current = next;
		placeInOrder(
			parent,
			[...next.values()].map((child) => child.node),
		);
	};
}

function canMoveBefore(parent: Element): parent is MovableParent {
	return 'moveBefore' in parent && parent.isConnected;
}

function place(parent: Element, node: Element, reference: Element | null): void {
	// `moveBefore` throws for a node not yet in the document
	if (node.isConnected && canMoveBefore(parent)) parent.moveBefore(node, reference);
	else if (reference) reference.before(node);
	else parent.append(node);
}

// Without `moveBefore` a move is a removal and a reinsertion, which blurs a focused node it moves
function placeInOrder(parent: Element, nodes: ReadonlyArray<Element>): void {
	const focused = document.activeElement;
	let reference = parent.firstElementChild;

	for (const node of nodes) {
		if (node === reference) reference = node.nextElementSibling;
		else place(parent, node, reference);
	}

	if (!(focused instanceof HTMLElement) || focused === document.activeElement) return;
	if (parent.contains(focused)) focused.focus();
}
