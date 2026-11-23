// A stand-in where `HTMLElement` is undefined, so the entry imports cleanly in server code
export const BaseElement =
	typeof HTMLElement === 'undefined' ? (Object as unknown as typeof HTMLElement) : HTMLElement;
