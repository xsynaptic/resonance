export interface CommentMessages {
	challenge: string;
	invalid: string;
	parentMissing: string;
	threadMissing: string;
	tooFast: string;
	tooLarge: string;
	unexpected: string;
	unreadable: string;
}

export const defaultMessages = {
	challenge: 'The challenge did not pass. Please reload the page and try again.',
	invalid: 'That submission was not valid.',
	parentMissing: 'That reply target does not exist.',
	threadMissing: 'That page does not take comments.',
	tooFast: 'That was too fast. Please try again.',
	tooLarge: 'That submission was too large.',
	unexpected: 'Something went wrong here. Please try again in a moment.',
	unreadable: 'That submission could not be read.',
} as const satisfies CommentMessages;
