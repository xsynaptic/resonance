import type { ReactNode } from 'react';

import { Component } from 'react';

interface PartBoundaryProps {
	children: ReactNode;
	onError: () => void;
	part: { reset: () => void };
}

interface PartBoundaryState {
	hasFailed: boolean;
}

// A part that fails to load would otherwise unmount the whole player mid-playback; mounted per open, so it never resets
export class PartBoundary extends Component<PartBoundaryProps, PartBoundaryState> {
	override state: PartBoundaryState = { hasFailed: false };

	static getDerivedStateFromError(): PartBoundaryState {
		return { hasFailed: true };
	}

	override componentDidCatch(): void {
		this.props.part.reset();
		this.props.onError();
	}

	override render() {
		return this.state.hasFailed ? undefined : this.props.children;
	}
}
