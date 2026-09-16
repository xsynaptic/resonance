interface Placement {
	isShown: boolean;
	node: Element;
	parent: Element;
	position: 'append' | 'prepend';
}

// Placed only when absent, since re-placing a focused node would blur it
export function placeWhen({ isShown, node, parent, position }: Placement): void {
	if (!isShown) {
		node.remove();
		return;
	}

	if (node.parentNode === parent) return;

	if (position === 'prepend') parent.prepend(node);
	else parent.append(node);
}
