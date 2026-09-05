import type { SVGProps } from 'react';

export function CloseIcon() {
	return (
		<Icon>
			<path d="M6 6l12 12M18 6 6 18" />
		</Icon>
	);
}

export function NextIcon() {
	return (
		<Icon fill="currentColor" stroke="none">
			<path d="M15 5h2v14h-2zM4 5l11 7L4 19z" />
		</Icon>
	);
}

export function PauseIcon() {
	return (
		<Icon fill="currentColor" stroke="none">
			<path d="M6 5h4v14H6zM14 5h4v14h-4z" />
		</Icon>
	);
}

export function PlayIcon() {
	return (
		<Icon fill="currentColor" stroke="none">
			<path d="M8 5v14l11-7z" />
		</Icon>
	);
}

export function PreviousIcon() {
	return (
		<Icon fill="currentColor" stroke="none">
			<path d="M7 5h2v14H7zM20 5v14L9 12z" />
		</Icon>
	);
}

export function QueueIcon() {
	return (
		<Icon>
			<path d="M4 6h16M4 12h16M4 18h10" />
		</Icon>
	);
}

export function ShuffleIcon() {
	return (
		<Icon>
			<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
		</Icon>
	);
}

export function VolumeIcon() {
	return (
		<Icon>
			<path d="M11 5 6 9H2v6h4l5 4zM19 5a10 10 0 0 1 0 14M15.5 8.5a5 5 0 0 1 0 7" />
		</Icon>
	);
}

export function VolumeMutedIcon() {
	return (
		<Icon>
			<path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6" />
		</Icon>
	);
}

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="20"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width="20"
			{...props}
		>
			{children}
		</svg>
	);
}
