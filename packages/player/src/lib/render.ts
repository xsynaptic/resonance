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
