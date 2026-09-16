type LinkClick = Pick<
	MouseEvent,
	'altKey' | 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'
>;

// The client router leaves a modified click, another target and a download to the browser, which keeps this page
export function isLeavingPage(event: LinkClick): boolean {
	if (isModifiedClick(event)) return false;

	const link = event.target instanceof Element ? event.target.closest('a[href]') : undefined;
	if (!(link instanceof HTMLAnchorElement)) return false;

	return (link.target === '' || link.target === '_self') && !link.hasAttribute('download');
}

function isModifiedClick(event: LinkClick): boolean {
	return event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}
