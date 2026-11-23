// Kept clear of the registry, which imports every element and would close a cycle back onto a lazy chunk
export function defineOnce(tag: string, elementClass: CustomElementConstructor): void {
	if (!customElements.get(tag)) customElements.define(tag, elementClass);
}
