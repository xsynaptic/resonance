// Every part's lifecycle in one place: one controller per connection, and a move that redoes nothing
// eslint-disable-next-line wc/define-tag-after-class-definition -- abstract, so only its subclasses are ever defined
export abstract class PlayerElement extends HTMLElement {
	#connection: AbortController | undefined;

	connectedCallback(): void {
		if (this.#connection) return;

		const connection = new AbortController();

		// A part that throws, as one outside a root does, leaves nothing bound behind it
		try {
			this.connect(connection.signal);
		} catch (error) {
			connection.abort();
			throw error;
		}

		this.#connection = connection;
	}

	connectedMoveCallback(): void {
		// Chrome and Firefox move the router's persisted bar with `moveBefore`, which keeps every binding
	}

	disconnectedCallback(): void {
		this.#connection?.abort();
		this.#connection = undefined;
	}

	protected appendOnce(child: Element): void {
		if (child.parentNode !== this) this.append(child);
	}

	protected abstract connect(signal: AbortSignal): void;

	// A property set before the tag was defined shadows its accessor until it is sent back through it
	protected upgradeProperty(name: keyof this): void {
		if (!Object.hasOwn(this, name)) return;

		const value = this[name];

		Reflect.deleteProperty(this, name);
		this[name] = value;
	}
}
