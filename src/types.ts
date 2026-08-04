export const HIGHLIGHT_COLOURS = ["sky", "amber", "rose", "lime", "violet", "slate"] as const;
export type HighlightColour = (typeof HIGHLIGHT_COLOURS)[number];
export type ReflectionScope = "note" | "through" | "branch" | "whole";

export interface Post {
	path: string;
	basename: string;
	/** Epoch ms; frontmatter `created`, else file ctime. Sort key. */
	created: number;
	updated: number | null;
	tags: string[];
	highlight: HighlightColour | null;
	/** Resolved vault path of the parent post; null for top-level posts. */
	replyTo: string | null;
	ai: boolean;
	mtime: number;
}

export interface Thread {
	root: Post;
	/** Branch-aware pre-order; siblings are newest-first. */
	replies: Post[];
}
