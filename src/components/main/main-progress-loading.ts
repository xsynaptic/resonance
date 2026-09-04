const animationDuration = 300;

// A navigation faster than this resolves before the bar says anything; showing it would just flash
const thresholdDelay = 200;

const restingProgress = 0.2;

class ProgressLoading extends HTMLElement {
	#fadeTimeout: number | undefined;
	#isLoading = false;
	#progress = restingProgress;
	#resetTimeout: number | undefined;
	#thresholdTimeout: number | undefined;
	#trickleInterval: number | undefined;

	connectedCallback() {
		document.addEventListener('astro:before-preparation', this.#handlePreparation);
		document.addEventListener('astro:before-swap', this.#handleSwap);
	}

	disconnectedCallback() {
		document.removeEventListener('astro:before-preparation', this.#handlePreparation);
		document.removeEventListener('astro:before-swap', this.#handleSwap);

		// Fires mid-swap without moveBefore; the fade and reset must outlive it or the bar sticks at full
		this.#clearLoadTimers();
	}

	#clearLoadTimers() {
		window.clearTimeout(this.#thresholdTimeout);
		window.clearInterval(this.#trickleInterval);
		this.#thresholdTimeout = undefined;
		this.#trickleInterval = undefined;
	}

	#handlePreparation = () => {
		// A second navigation before the swap would strand the previous run's trickle, which never stops
		this.#clearLoadTimers();
		window.clearTimeout(this.#fadeTimeout);
		window.clearTimeout(this.#resetTimeout);
		this.#fadeTimeout = undefined;
		this.#resetTimeout = undefined;

		this.#isLoading = true;
		this.#progress = 0;
		this.#setProgress(0);

		this.#thresholdTimeout = window.setTimeout(() => {
			this.#thresholdTimeout = undefined;
			this.#setOpacity(1);
			this.#trickleInterval = window.setInterval(() => {
				this.#progress += Math.random() * 0.03;
				this.#setProgress(this.#progress);
			}, animationDuration);
		}, thresholdDelay);
	};

	#handleSwap = () => {
		if (!this.#isLoading) return;

		this.#isLoading = false;
		this.#clearLoadTimers();

		this.#progress = 1;
		this.#setProgress(1);

		this.#fadeTimeout = window.setTimeout(() => {
			this.#fadeTimeout = undefined;
			this.#setOpacity(0);
		}, animationDuration / 2);

		this.#resetTimeout = window.setTimeout(() => {
			this.#resetTimeout = undefined;
			this.#progress = restingProgress;
			this.#setProgress(restingProgress);
		}, animationDuration * 2);
	};

	#setOpacity(value: number) {
		this.style.setProperty('opacity', String(value));
	}

	#setProgress(value: number) {
		this.style.setProperty('--progress-loading', String(value));
	}
}

if (!customElements.get('progress-loading')) {
	customElements.define('progress-loading', ProgressLoading);
}

export {};

declare global {
	interface HTMLElementTagNameMap {
		'progress-loading': ProgressLoading;
	}
}
