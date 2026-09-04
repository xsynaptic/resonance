/**
 * A disclosure navigation menu web component; DOM contract:
 *
 * <menu-navigation>
 *   <nav>
 *     <ul>
 *       <li>
 *         <a|button>          <-- the item itself; always an ordinary tab stop
 *         <button data-nav-toggle aria-expanded>  <-- required when the <li> has a submenu
 *         <ul>...</ul>        <-- optional submenu; must be a direct child of the <li>
 *       </li>
 *     </ul>
 *   </nav>
 * </menu-navigation>
 *
 * Every link stays in the tab order and keeps its own semantics, so the toggle is the only thing
 * this owns. Menu and menubar roles are deliberately absent: they are for application menus, and
 * they cost a keyboard user every link but the first
 *
 * State exposed for CSS:
 *   data-has-submenu  on every <li> that has a submenu
 *   data-open         on every currently-open <li>
 */
let instanceCount = 0;

class MenuNavigation extends HTMLElement {
	#abortController: AbortController | undefined;
	#initialized = false;
	#instanceId = `nav-${String(instanceCount++)}`;

	connectedCallback() {
		// Submenu ids are written into the light DOM once; a move or reconnect must not re-run it
		if (!this.#initialized) {
			this.#connectSubmenus();
			this.#initialized = true;
		}

		this.#abortController = new AbortController();

		const { signal } = this.#abortController;

		this.addEventListener('click', this.#handleClick, { signal });
		this.addEventListener('keydown', this.#handleKeydown, { signal });
		this.addEventListener('focusout', this.#handleFocusOut, { signal });
		document.addEventListener('click', this.#handleClickOutside, { signal });
	}

	disconnectedCallback() {
		this.#abortController?.abort();
		this.#abortController = undefined;
	}

	#close(li: HTMLElement) {
		this.#resetItem(li);

		for (const child of li.querySelectorAll<HTMLElement>('[data-open]')) {
			this.#resetItem(child);
		}
	}

	#closeAll() {
		for (const li of this.querySelectorAll<HTMLElement>('[data-open]')) {
			this.#resetItem(li);
		}
	}

	#closeSiblings(li: HTMLElement) {
		const parent = li.parentElement;

		if (!parent) return;

		for (const sibling of parent.children) {
			if (sibling !== li && sibling instanceof HTMLElement) {
				this.#close(sibling);
			}
		}
	}

	#connectSubmenus() {
		let submenuId = 0;

		for (const li of this.querySelectorAll<HTMLElement>('li')) {
			const submenu = this.#getSubmenu(li);
			const toggle = this.#getToggle(li);

			if (!submenu || !toggle) continue;

			li.dataset.hasSubmenu = '';
			submenu.id = `${this.#instanceId}-sub-menu-${String(submenuId++)}`;
			toggle.setAttribute('aria-controls', submenu.id);
		}
	}

	#getSubmenu(li: HTMLElement): HTMLElement | undefined {
		return li.querySelector<HTMLElement>(':scope > ul') ?? undefined;
	}

	#getToggle(li: HTMLElement): HTMLElement | undefined {
		const submenu = this.#getSubmenu(li);

		for (const toggle of li.querySelectorAll<HTMLElement>('[data-nav-toggle]')) {
			if (!submenu?.contains(toggle)) return toggle;
		}

		return undefined;
	}

	#handleClick = (event: Event) => {
		const toggle = (event.target as Element).closest<HTMLElement>('[data-nav-toggle]');

		if (!toggle) return;

		const li = toggle.closest<HTMLElement>('li[data-has-submenu]');

		if (!li) return;

		event.preventDefault();

		this.#closeSiblings(li);
		this.#toggle(li);
	};

	#handleClickOutside = (event: Event) => {
		if (!this.contains(event.target as Node)) {
			this.#closeAll();
		}
	};

	// Tabbing out of an open submenu has to close it; hovering it never opened `data-open` at all
	#handleFocusOut = (event: FocusEvent) => {
		const { relatedTarget } = event;

		for (const li of this.querySelectorAll<HTMLElement>('[data-open]')) {
			if (relatedTarget instanceof Node && li.contains(relatedTarget)) continue;

			this.#resetItem(li);
		}
	};

	#handleKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;

		const li = (event.target as Element).closest<HTMLElement>('li[data-open]');

		if (!li) return;

		event.preventDefault();

		this.#close(li);
		this.#getToggle(li)?.focus();
	};

	#open(li: HTMLElement) {
		li.dataset.open = '';
		this.#getToggle(li)?.setAttribute('aria-expanded', 'true');
	}

	#resetItem(li: HTMLElement) {
		delete li.dataset.open;
		this.#getToggle(li)?.setAttribute('aria-expanded', 'false');
	}

	#toggle(li: HTMLElement) {
		if (li.dataset.open === undefined) this.#open(li);
		else this.#close(li);
	}
}

if (!customElements.get('menu-navigation')) {
	customElements.define('menu-navigation', MenuNavigation);
}

export {};

declare global {
	interface HTMLElementTagNameMap {
		'menu-navigation': MenuNavigation;
	}
}
