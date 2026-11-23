export function placeSeekButtons(previous: Element, next: Element, seconds: number): void {
	const back = document.createElement('pzm-seek-button');
	const forward = document.createElement('pzm-seek-button');

	back.setAttribute('seconds', String(-seconds));
	forward.setAttribute('seconds', String(seconds));
	previous.after(back);
	next.before(forward);
}
