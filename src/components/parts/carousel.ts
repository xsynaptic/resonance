// Progressive enhancement: the track scrolls natively, and `data-enhanced` reveals the prev/next buttons
class CarouselSlides extends HTMLElement {
	#abortController: AbortController | undefined;

	connectedCallback() {
		this.#abortController?.abort();
		this.#abortController = new AbortController();

		this.addEventListener('click', this.#handleClick, { signal: this.#abortController.signal });
		this.dataset.enhanced = '';
	}

	disconnectedCallback() {
		this.#abortController?.abort();
		this.#abortController = undefined;
	}

	#handleClick = (event: Event) => {
		const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-carousel-nav]');

		if (!button) return;

		const track = this.querySelector<HTMLElement>('[data-carousel-track]');

		if (!track) return;

		track.scrollTo({
			left: getScrollTarget(track, button.dataset.carouselNav === 'next'),
		});
	};
}

// Advance by whole screens of slides, so the scroll always lands on a snap point
// Slide pitch comes from the offset between the first two, which already includes the gap
function getScrollStep(track: HTMLElement): number {
	const [first, second] = track.querySelectorAll<HTMLElement>('li');

	if (!first) return track.clientWidth;

	const step = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;

	if (step <= 0) return track.clientWidth;

	return Math.max(1, Math.floor(track.clientWidth / step)) * step;
}

// Past either end the scroll wraps around, so both buttons stay useful
function getScrollTarget(track: HTMLElement, isForward: boolean): number {
	const step = getScrollStep(track);
	const maxScroll = track.scrollWidth - track.clientWidth;

	if (isForward) {
		return track.scrollLeft > maxScroll - step / 2
			? 0
			: Math.min(maxScroll, track.scrollLeft + step);
	}

	return track.scrollLeft < step / 2 ? maxScroll : Math.max(0, track.scrollLeft - step);
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
