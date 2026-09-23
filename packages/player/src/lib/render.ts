type Children<
	Child,
	Count extends number,
	Found extends Array<Child> = [],
> = Found['length'] extends Count ? Found : Children<Child, Count, [...Found, Child]>;

export function requireChild<Child extends Element>(
	root: Element,
	selector: string,
	child: new () => Child,
): Child {
	const found = root.querySelector(selector);
	if (!(found instanceof child)) throw new Error(`A template is missing its ${selector}`);

	return found;
}

// eslint-disable-next-line max-params -- root, selector, count and class read left to right like `requireChild`
export function requireChildren<Child extends Element, Count extends number>(
	root: Element,
	selector: string,
	count: Count,
	child: new () => Child,
): Children<Child, Count> {
	const found = [...root.querySelectorAll(selector)];

	if (found.length !== count || found.some((element) => !(element instanceof child))) {
		throw new Error(`A template is missing one of its ${String(count)} ${selector}`);
	}

	return found as Children<Child, Count>;
}

// Checked against the root it promises, so a template typo fails at the first clone rather than as a null later
export function template<Root extends Element>(html: string, root: new () => Root): () => Root {
	const parsed = document.createElement('template');

	parsed.innerHTML = html;

	return () => {
		const clone = document.importNode(parsed.content, true).firstElementChild;
		if (!(clone instanceof root)) throw new Error(`A template's root is not a ${root.name}`);

		return clone;
	};
}
