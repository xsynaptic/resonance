// Progressive enhancement: the track scrolls natively, and `data-enhanced` reveals the prev/next buttons
class CarouselSlides extends HTMLElement {
	#abortController: AbortController | undefined;
	#resizeObserver: ResizeObserver | undefined;
	#track: HTMLElement | undefined;

	connectedCallback() {
		this.#abortController?.abort();
		this.#abortController = new AbortController();

		this.addEventListener('click', this.#handleClick, { signal: this.#abortController.signal });

		this.#track = this.querySelector<HTMLElement>('[data-carousel-track]') ?? undefined;

		if (this.#track) {
			this.#resizeObserver?.disconnect();
			this.#resizeObserver = new ResizeObserver(this.#updateOverflow);
			this.#resizeObserver.observe(this.#track);
		}

		this.dataset.enhanced = '';
	}

	disconnectedCallback() {
		this.#abortController?.abort();
		this.#abortController = undefined;
		this.#resizeObserver?.disconnect();
		this.#resizeObserver = undefined;
		this.#track = undefined;
	}

	#handleClick = (event: Event) => {
		const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-carousel-nav]');

		if (!button || !this.#track) return;

		this.#track.scrollTo({
			left: getScrollTarget(this.#track, button.dataset.carouselNav === 'next'),
		});
	};

	// Nothing to page through when a screen holds every slide, so the buttons stay hidden
	// Fractional column widths leave a sliver of scroll on an exact fit
	#updateOverflow = () => {
		if (!this.#track) return;

		const isOverflowing = this.#track.scrollWidth - this.#track.clientWidth > 1;

		if (isOverflowing === (this.dataset.overflow !== undefined)) return;

		if (isOverflowing) {
			this.dataset.overflow = '';
			return;
		}

		delete this.dataset.overflow;
	};
}

// Advance by whole screens of slides, so the scroll always lands on a snap point
// Pitch comes from the offset between the first two slides, measured fractionally because columns divide unevenly
function getScrollStep(track: HTMLElement): number {
	const [first, second] = track.querySelectorAll<HTMLElement>(':scope > li');

	if (!first) return track.clientWidth;

	const firstRect = first.getBoundingClientRect();
	const pitch = second ? second.getBoundingClientRect().left - firstRect.left : firstRect.width;

	if (pitch <= 0) return track.clientWidth;

	// A screen holds n slides and n-1 gaps, so the gap is added back before dividing by the pitch
	const gap = pitch - firstRect.width;
	const perScreen = Math.floor((track.clientWidth + gap + 1) / pitch);

	return Math.max(1, perScreen) * pitch;
}

// Past either end the scroll wraps around, so both buttons stay useful
function getScrollTarget(track: HTMLElement, isForward: boolean): number {
	const step = getScrollStep(track);
	const maxScroll = track.scrollWidth - track.clientWidth;

	// Wraps only at the true end; a half-step threshold goes negative when the overflow is under half a screen
	if (isForward) {
		return track.scrollLeft >= maxScroll - 1 ? 0 : Math.min(maxScroll, track.scrollLeft + step);
	}

	return track.scrollLeft <= 1 ? maxScroll : Math.max(0, track.scrollLeft - step);
}

if (!customElements.get('carousel-slides')) {
	customElements.define('carousel-slides', CarouselSlides);
}

export {};

declare global {
	interface HTMLElementTagNameMap {
		'carousel-slides': CarouselSlides;
	}
}
