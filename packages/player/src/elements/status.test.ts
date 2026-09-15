import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#components/test-labels.ts';
import { mount } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-status>', () => {
	test('says nothing while idle', () => {
		const { part } = mount('player-status');
		const region = getByRole(part, 'status');

		expect(region.textContent).toBe('');
		expect(region.dataset.visible).toBeUndefined();
	});

	test('reports an error with the skull, and keeps the words while it fades', () => {
		const { part, store } = mount('player-status');
		const region = getByRole(part, 'status');

		store.setState({ status: 'error' });

		expect(region.textContent).toBe(labels.error);
		expect(region.dataset.status).toBe('error');
		expect(region.dataset.visible).toBe('');
		expect(region.querySelector('svg')).not.toBeNull();

		store.setState({ status: 'playing' });

		expect(region.dataset.visible).toBeUndefined();
		expect(region.textContent).toBe(labels.error);

		store.setState({ status: 'capped' });

		expect(region.textContent).toBe(labels.capped);
		expect(region.querySelector('svg')).toBeNull();
	});
});
