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

	// Safari's router has no `moveBefore`, so it disconnects and reconnects the persisted bar twice per swap in one task
	disconnectedCallback(): void {
		const connection = this.#connection;
		if (!connection) return;

		queueMicrotask(() => {
			if (this.isConnected || this.#connection !== connection) return;

			connection.abort();
			this.#connection = undefined;
		});
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
