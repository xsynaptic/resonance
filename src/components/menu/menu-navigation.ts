/**
 * An accessible nested menu web component; DOM contract:
 *
 * <menu-navigation>
 *   <nav>
 *     <ul>                  <-- becomes role="menubar"
 *       <li>                <-- a menu item
 *         <a|button|span>   <-- first element in the <li> that is NOT inside the submenu
 *         <ul>...</ul>      <-- optional submenu; must be a direct child of the <li>
 *       </li>
 *     </ul>
 *   </nav>
 * </menu-navigation>
 *
 * Use <a> for navigable triggers, <button> for text-only labels with children, <span> for text-only
 *
 * State exposed for CSS:
 *   data-has-submenu  on every <li> that has a submenu
 *   data-open         on every currently-open <li>
 */
let instanceCount = 0;

class NavMenu extends HTMLElement {
	#controller: AbortController | undefined;
	#initialized = false;
	#instanceId = `nav-${String(instanceCount++)}`;
	#lastPointerType = '';

	connectedCallback() {
		// ARIA injection mutates the light DOM once; a move/reconnect must not re-run it
		if (!this.#initialized) {
			this.#injectAria();
			this.#initialized = true;
		}

		this.#controller = new AbortController();

		const { signal } = this.#controller;

		this.addEventListener('pointerdown', this.#handlePointerDown, { signal });
		this.addEventListener('click', this.#handleClick, { signal });
		this.addEventListener('keydown', this.#handleKeydown, { signal });
		document.addEventListener('click', this.#handleClickOutside, { signal });
	}

	disconnectedCallback() {
		this.#controller?.abort();
		this.#controller = undefined;
	}

	#close(li: HTMLElement) {
		this.#resetItem(li);

		for (const child of li.querySelectorAll<HTMLElement>('[data-open]')) {
			this.#resetItem(child);
		}
	}

	#closeAll() {
		for (const el of this.querySelectorAll<HTMLElement>('[data-open]')) {
			this.#resetItem(el);
		}
	}

	#closeAndFocusTrigger(li: HTMLElement) {
		const parentUl = li.closest<HTMLElement>('ul[role="menu"]');

		if (!parentUl) {
			this.#closeAll();
			return;
		}

		const triggerLi = parentUl.closest<HTMLElement>('li');

		if (triggerLi) {
			this.#close(triggerLi);

			const triggerElement = this.#getTrigger(triggerLi);

			if (triggerElement) {
				this.#setRovingTabindex(triggerElement);
				triggerElement.focus();
			}
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

	#connectSubmenu(li: HTMLElement, submenu: HTMLElement, id: string) {
		li.dataset.hasSubmenu = '';

		submenu.id = id;
		submenu.setAttribute('role', 'menu');

		const trigger = this.#getTrigger(li);

		if (!trigger) return;

		trigger.setAttribute('aria-haspopup', 'true');
		trigger.setAttribute('aria-expanded', 'false');
		trigger.setAttribute('aria-controls', id);
	}

	#expand(li: HTMLElement) {
		if (li.dataset.hasSubmenu === undefined) return;

		this.#open(li);
		this.#focusFirstItem(li);
	}

	#focusEdgeItem(li: HTMLElement, edge: 'first' | 'last') {
		const parentUl = li.closest<HTMLElement>('ul');

		if (!parentUl) return;

		const menuitems = this.#getMenuitems(parentUl);
		const trigger = edge === 'first' ? menuitems[0] : menuitems.at(-1);

		if (trigger) {
			this.#setRovingTabindex(trigger);
			trigger.focus();
		}
	}

	#focusFirstItem(li: HTMLElement) {
		const submenu = this.#getSubmenu(li);

		if (!submenu) return;

		const firstTrigger = this.#getMenuitems(submenu)[0];

		if (firstTrigger) {
			this.#setRovingTabindex(firstTrigger);
			firstTrigger.focus();
		}
	}

	// Leaving the top of a submenu returns to the trigger that opened it
	#focusPreviousItem(li: HTMLElement) {
		const siblings = this.#getSiblingItems(li);

		if (siblings[0] === li) {
			this.#closeAndFocusTrigger(li);
			return;
		}

		this.#focusSibling(li, 'prev');
	}

	#focusSibling(li: HTMLElement, direction: 'next' | 'prev') {
		const items = this.#getSiblingItems(li);
		const currentIndex = items.indexOf(li);

		if (currentIndex === -1) return;

		const nextIndex =
			(direction === 'next' ? currentIndex + 1 : currentIndex - 1 + items.length) % items.length;

		const nextItem = items[nextIndex];
		const nextTrigger = nextItem ? this.#getTrigger(nextItem) : undefined;

		if (nextTrigger) {
			this.#setRovingTabindex(nextTrigger);
			nextTrigger.focus();
		}
	}

	#getMenuitems(ul: HTMLElement): Array<HTMLElement> {
		const menuitems: Array<HTMLElement> = [];

		for (const li of ul.querySelectorAll<HTMLElement>(':scope > li')) {
			const trigger = this.#getTrigger(li);
			if (trigger) menuitems.push(trigger);
		}

		return menuitems;
	}

	#getSiblingItems(li: HTMLElement) {
		const parentUl = li.closest<HTMLElement>('ul');

		if (!parentUl) return [];

		return [...parentUl.querySelectorAll<HTMLElement>(':scope > li')];
	}

	#getSubmenu(li: HTMLElement): HTMLElement | undefined {
		return li.querySelector<HTMLElement>(':scope > ul') ?? undefined;
	}

	#getTrigger(li: HTMLElement): HTMLElement | undefined {
		const submenu = this.#getSubmenu(li);

		for (const trigger of li.querySelectorAll<HTMLElement>('a, button')) {
			if (!submenu?.contains(trigger)) return trigger;
		}

		return undefined;
	}

	#handleClick = (event: Event) => {
		const target = event.target as Element;
		const li = target.closest<HTMLElement>('li[data-has-submenu]');

		if (!li) {
			this.#closeAll();
			return;
		}

		// Clicks inside the submenu belong to its own items
		if (!this.#triggerContains(li, target)) return;

		const trigger = this.#getTrigger(li);
		const isAnchorTrigger = trigger instanceof HTMLAnchorElement && trigger.contains(target);

		if (isAnchorTrigger && this.#lastPointerType === 'touch') {
			this.#openOnFirstTap(event, li);
			return;
		}

		// Non-touch click on an anchor: let it navigate normally
		if (isAnchorTrigger) return;

		event.preventDefault();

		this.#closeSiblings(li);
		this.#toggle(li);
	};

	#handleClickOutside = (event: Event) => {
		if (!this.contains(event.target as Node)) {
			this.#closeAll();
		}
	};

	#handleKeydown = (event: KeyboardEvent) => {
		const target = event.target as Element;

		if (!this.contains(target)) return;

		const menuitem = target.closest<HTMLElement>('[role="menuitem"]');

		if (!menuitem) {
			if (event.key === 'Escape') this.#closeAll();
			return;
		}

		const li = menuitem.closest<HTMLElement>('li');

		if (!li) return;

		const isMenubar = li.closest<HTMLElement>('ul')?.getAttribute('role') === 'menubar';

		const wasHandled = isMenubar
			? this.#handleMenubarKey(event.key, li)
			: this.#handleSubmenuKey(event.key, li);

		if (wasHandled) event.preventDefault();
	};

	// Horizontal axis: siblings run left/right, down opens into the submenu
	// Returns whether the key was consumed, so the caller knows to suppress the default action
	#handleMenubarKey(key: string, li: HTMLElement): boolean {
		switch (key) {
			case ' ':
			case 'Enter': {
				return this.#toggleAndFocus(li);
			}
			case 'ArrowDown': {
				this.#expand(li);
				return true;
			}
			case 'ArrowLeft': {
				this.#focusSibling(li, 'prev');
				return true;
			}
			case 'ArrowRight': {
				this.#focusSibling(li, 'next');
				return true;
			}
			// Nothing above the menubar, but the page must not scroll either
			case 'ArrowUp': {
				return true;
			}
			case 'End': {
				this.#focusEdgeItem(li, 'last');
				return true;
			}
			case 'Escape': {
				this.#closeAndFocusTrigger(li);
				return true;
			}
			case 'Home': {
				this.#focusEdgeItem(li, 'first');
				return true;
			}
			default: {
				return false;
			}
		}
	}

	#handlePointerDown = (event: PointerEvent) => {
		this.#lastPointerType = event.pointerType;
	};

	// Vertical axis: siblings run up/down, right opens a nested submenu, left backs out
	#handleSubmenuKey(key: string, li: HTMLElement): boolean {
		switch (key) {
			case ' ':
			case 'Enter': {
				return this.#toggleAndFocus(li);
			}
			case 'ArrowDown': {
				this.#focusSibling(li, 'next');
				return true;
			}
			case 'ArrowLeft': {
				this.#closeAndFocusTrigger(li);
				return true;
			}
			case 'ArrowRight': {
				if (li.dataset.hasSubmenu === undefined) return false;

				this.#expand(li);
				return true;
			}
			case 'ArrowUp': {
				this.#focusPreviousItem(li);
				return true;
			}
			case 'End': {
				this.#focusEdgeItem(li, 'last');
				return true;
			}
			case 'Escape': {
				this.#closeAndFocusTrigger(li);
				return true;
			}
			case 'Home': {
				this.#focusEdgeItem(li, 'first');
				return true;
			}
			default: {
				return false;
			}
		}
	}

	#injectAria() {
		const menubar = this.querySelector<HTMLElement>(':scope > nav > ul');

		if (!menubar) return;

		menubar.setAttribute('role', 'menubar');

		let submenuId = 0;

		for (const li of this.querySelectorAll<HTMLElement>('li')) {
			li.setAttribute('role', 'none');

			const trigger = this.#getTrigger(li);

			if (trigger) trigger.setAttribute('role', 'menuitem');

			const submenu = this.#getSubmenu(li);

			if (!submenu) continue;

			this.#connectSubmenu(li, submenu, `${this.#instanceId}-sub-menu-${String(submenuId++)}`);
		}

		// Roving tabindex on menubar items
		for (const [index, trigger] of this.#getMenuitems(menubar).entries()) {
			trigger.setAttribute('tabindex', index === 0 ? '0' : '-1');
		}
	}

	#open(li: HTMLElement) {
		li.dataset.open = '';

		const trigger = this.#getTrigger(li);

		if (trigger) trigger.setAttribute('aria-expanded', 'true');
	}

	// Touch taps on an anchor menuitem: first tap opens the submenu, second tap navigates
	#openOnFirstTap(event: Event, li: HTMLElement) {
		if (li.dataset.open !== undefined) return;

		event.preventDefault();

		this.#closeSiblings(li);
		this.#open(li);
	}

	#resetItem(li: HTMLElement) {
		delete li.dataset.open;

		const trigger = this.#getTrigger(li);

		if (trigger) trigger.setAttribute('aria-expanded', 'false');
	}

	#setRovingTabindex(activeTrigger: HTMLElement) {
		const parentUl = activeTrigger.closest<HTMLElement>('ul');

		if (!parentUl) return;

		for (const trigger of this.#getMenuitems(parentUl)) {
			trigger.setAttribute('tabindex', trigger === activeTrigger ? '0' : '-1');
		}
	}

	#toggle(li: HTMLElement) {
		if (li.dataset.open === undefined) this.#open(li);
		else this.#close(li);
	}

	// Keyboard toggling moves focus into the submenu; a pointer toggle must not
	#toggleAndFocus(li: HTMLElement): boolean {
		if (li.dataset.hasSubmenu === undefined) return false;

		const wasClosed = li.dataset.open === undefined;

		this.#toggle(li);

		if (wasClosed) this.#focusFirstItem(li);

		return true;
	}

	#triggerContains(li: HTMLElement, target: Node): boolean {
		const submenu = this.#getSubmenu(li);
		return !submenu?.contains(target);
	}
}

if (!customElements.get('menu-navigation')) {
	customElements.define('menu-navigation', NavMenu);
}

export {};

declare global {
	interface HTMLElementTagNameMap {
		'menu-navigation': NavMenu;
	}
}
