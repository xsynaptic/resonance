export interface CommentChallengeWidget {
	remove: () => Promise<void>;
	render: (container: HTMLElement) => Promise<void>;
}
