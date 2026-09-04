// No JS: prev/next links and the "Page X of Y" counter work, the empty form stays hidden
// With JS: the <select> is filled from data attributes, the form revealed, the counter hidden
// Navigation commits on change only for a pointer-driven pick on a fine pointer, otherwise via Go or Enter
class PaginationSelect extends HTMLElement {
	#abortController: AbortController | undefined;
	#form: HTMLFormElement | undefined;
	#initialized = false;
	#isPointerDriven = false;
	#select: HTMLSelectElement | undefined;
	#submit: HTMLButtonElement | undefined;

	connectedCallback() {
		if (!this.#initialized) {
			this.#enhance();
			this.#initialized = true;
		}

		if (!this.#form || !this.#select) return;

		this.#abortController = new AbortController();
		const { signal } = this.#abortController;

		this.#form.addEventListener('submit', this.#handleSubmit, { signal });
		this.#select.addEventListener('change', this.#handleChange, { signal });
		this.#select.addEventListener('pointerdown', this.#handlePointerDown, { signal });
		this.#select.addEventListener('keydown', this.#handleKeyDown, { signal });
	}

	disconnectedCallback() {
		this.#abortController?.abort();
		this.#abortController = undefined;
	}

	#buildOptions(lastPage: number): Array<HTMLOptionElement> {
		const currentPage = Number(this.dataset.currentPage);
		// Handed over as an attribute so the string dictionary stays out of the client bundle
		const pageLabel = this.dataset.pageLabel ?? 'Page {page}';
		const options: Array<HTMLOptionElement> = [];

		for (let pageNumber = 1; pageNumber <= lastPage; pageNumber++) {
			const option = document.createElement('option');

			option.value = String(pageNumber);
			option.textContent = pageLabel.replace('{page}', () => String(pageNumber));
			option.selected = pageNumber === currentPage;
			if (pageNumber === currentPage) option.dataset.currentPage = '';

			options.push(option);
		}

		return options;
	}

	#enhance() {
		const lastPage = Number(this.dataset.lastPage);

		if (!Number.isSafeInteger(lastPage) || lastPage <= 1) return;

		const form = this.querySelector<HTMLFormElement>('[data-pagination-form]');
		const select = this.querySelector<HTMLSelectElement>('[data-pagination-control]');

		if (!form || !select) return;

		const counter = this.querySelector<HTMLElement>('[data-pagination-counter]');

		select.append(...this.#buildOptions(lastPage));

		if (counter) counter.hidden = true;
		form.hidden = false;

		this.#lockSelectWidth(select, lastPage);

		this.#form = form;
		this.#select = select;
		this.#submit = form.querySelector<HTMLButtonElement>('[data-pagination-submit]') ?? undefined;
		this.#syncSubmit();
	}

	#getPageUrl(pageNumber: number): string {
		const basePath = this.dataset.basePath ?? '';

		return pageNumber === 1 ? basePath : `${basePath}${String(pageNumber)}/`;
	}

	#handleChange = () => {
		// A coarse-pointer picker is easy to mis-tap, so touch commits through Go
		// Firefox changes a closed select on arrow keys and wheel, so keyboard changes never navigate
		const shouldNavigate = this.#isPointerDriven && !matchMedia('(pointer: coarse)').matches;

		this.#isPointerDriven = false;

		// Syncing here would flash Go while the navigation resolves
		if (shouldNavigate) {
			this.#navigateToSelectedPage();
			return;
		}

		this.#syncSubmit();
	};

	#handleKeyDown = () => {
		this.#isPointerDriven = false;
	};

	#handlePointerDown = () => {
		this.#isPointerDriven = true;
	};

	#handleSubmit = (event: SubmitEvent) => {
		event.preventDefault();
		this.#navigateToSelectedPage();
	};

	// Pin a width floor to the widest label so changing pages never resizes the control
	// The 0.5ch buffer absorbs metric variance
	#lockSelectWidth(select: HTMLSelectElement, lastPage: number) {
		const lockWidth = () => {
			const selectedValue = select.value;

			select.style.minInlineSize = '';
			select.value = String(lastPage);
			const width = Math.ceil(select.getBoundingClientRect().width);
			select.value = selectedValue;

			if (width > 0) select.style.minInlineSize = `calc(${String(width)}px + 0.5ch)`;
		};

		lockWidth();

		// Fallback metrics mis-size the floor, so re-measure once webfonts settle
		if (document.fonts.status !== 'loaded') {
			void (async () => {
				await document.fonts.ready;
				lockWidth();
			})();
		}
	}

	#navigateToSelectedPage() {
		if (!this.#select) return;

		const pageNumber = Number(this.#select.value);
		const currentPage = Number(this.dataset.currentPage);

		if (pageNumber === currentPage || !Number.isSafeInteger(pageNumber)) return;

		location.assign(this.#getPageUrl(pageNumber));
	}

	#syncSubmit() {
		if (!this.#submit || !this.#select) return;

		const isChanged = this.#select.value !== (this.dataset.currentPage ?? '');

		this.#submit.toggleAttribute('data-visible', isChanged);
	}
}

if (!customElements.get('pagination-select')) {
	customElements.define('pagination-select', PaginationSelect);
}

export {};

declare global {
	interface HTMLElementTagNameMap {
		'pagination-select': PaginationSelect;
	}
}
