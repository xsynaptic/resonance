import type { ComponentType, ReactNode } from 'react';

import { createElement, lazy, Suspense } from 'react';

import { PartBoundary } from '#components/part-boundary.tsx';
import { usePreloadWhenQueued } from '#components/preload-when-queued.ts';

interface PartMountProps {
	fallback?: ReactNode;
	onFailed: () => void;
}

export function createLazyPart<Props extends object>(load: () => Promise<ComponentType<Props>>) {
	let current = createLazy();

	function createLazy() {
		return lazy(async () => ({ default: await load() }));
	}

	function preload(): void {
		void settle(load());
	}

	// React caches a rejected lazy; swapped only once caught, since a swap before React's retry render imports again unseen
	function reset(): void {
		current = createLazy();
	}

	function Component(props: PartMountProps & Props) {
		return (
			<PartBoundary onError={props.onFailed} onReset={reset}>
				<Suspense fallback={props.fallback}>{createElement(current, props)}</Suspense>
			</PartBoundary>
		);
	}

	function usePreload() {
		usePreloadWhenQueued(preload);

		return { onFocus: preload, onPointerEnter: preload };
	}

	return { Component, preload, usePreload };
}

async function settle(pending: Promise<unknown>): Promise<void> {
	try {
		await pending;
	} catch {
		// A failed preload surfaces again on open, where `PartBoundary` closes the part
	}
}
