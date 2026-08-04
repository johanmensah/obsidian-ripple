import { HighlightColour, Post, Thread } from "../types";

// Pure functions over Post[]; no obsidian imports, so they can be exercised
// outside the plugin (scripted checks bundle this file alone).

export interface MonthEntry {
	/** "YYYY-MM", local time. */
	key: string;
	year: number;
	month: number;
	count: number;
}

export interface TagEntry {
	tag: string;
	count: number;
}

export interface DayGroup {
	label: string;
	threads: Thread[];
}

export function monthKeyOf(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Collapses posts into top-level threads, newest-first. Children are
 * newest-first, with each child's descendants immediately after it.
 */
export function assembleThreads(posts: Post[]): Thread[] {
	const byPath = new Map(posts.map((p) => [p.path, p]));
	const children = new Map<string, Post[]>();
	const roots: Post[] = [];
	for (const post of posts) {
		if (!post.replyTo || !byPath.has(post.replyTo)) {
			roots.push(post);
			continue;
		}
		const siblings = children.get(post.replyTo) ?? [];
		siblings.push(post);
		children.set(post.replyTo, siblings);
	}
	for (const siblings of children.values()) {
		siblings.sort(compareNewestFirst);
	}

	const visited = new Set<string>();
	const threads: Thread[] = [];
	const addThread = (root: Post) => {
		if (visited.has(root.path)) return;
		visited.add(root.path);
		const replies: Post[] = [];
		const addChildren = (parentPath: string) => {
			for (const child of children.get(parentPath) ?? []) {
				if (visited.has(child.path)) continue;
				visited.add(child.path);
				replies.push(child);
				addChildren(child.path);
			}
		};
		addChildren(root.path);
		threads.push({ root, replies });
	};

	for (const root of roots.sort(compareNewestFirst)) addThread(root);
	// Malformed cycles have no natural root. Fall back deterministically so
	// every file remains visible and traversal always terminates.
	for (const post of [...posts].sort(compareNewestFirst)) addThread(post);
	threads.sort((a, b) => compareNewestFirst(a.root, b.root));
	return threads;
}

function compareOldestFirst(a: Post, b: Post): number {
	return a.created - b.created || a.path.localeCompare(b.path);
}

function compareNewestFirst(a: Post, b: Post): number {
	return b.created - a.created || b.path.localeCompare(a.path);
}

/** The chronologically newest persisted note, independent of branch order. */
export function mostRecentPost(thread: Thread): Post {
	return thread.replies.reduce(
		(latest, post) => (compareOldestFirst(post, latest) > 0 ? post : latest),
		thread.root,
	);
}

/** Months with top-level post counts, newest-first. */
export function countMonths(threads: Thread[]): MonthEntry[] {
	const entries = new Map<string, MonthEntry>();
	for (const { root } of threads) {
		const key = monthKeyOf(root.created);
		const entry = entries.get(key);
		if (entry) entry.count++;
		else {
			const d = new Date(root.created);
			entries.set(key, { key, year: d.getFullYear(), month: d.getMonth() + 1, count: 1 });
		}
	}
	return [...entries.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export function countTags(posts: Post[]): TagEntry[] {
	const counts = new Map<string, number>();
	for (const post of posts) {
		for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => a.tag.localeCompare(b.tag));
}

export function countHighlights(posts: Post[]): Partial<Record<HighlightColour, number>> {
	const counts: Partial<Record<HighlightColour, number>> = {};
	for (const post of posts) {
		if (post.highlight) counts[post.highlight] = (counts[post.highlight] ?? 0) + 1;
	}
	return counts;
}

/** Threads (assumed newest-first) bucketed under sticky day headers. */
export function groupByDay(threads: Thread[], now: number): DayGroup[] {
	const groups: DayGroup[] = [];
	let current: DayGroup | null = null;
	let currentDay = NaN;
	for (const thread of threads) {
		const day = startOfDay(thread.root.created);
		if (!current || day !== currentDay) {
			current = { label: dayLabel(thread.root.created, now), threads: [] };
			currentDay = day;
			groups.push(current);
		}
		current.threads.push(thread);
	}
	return groups;
}

function startOfDay(ts: number): number {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

export function dayLabel(ts: number, now: number): string {
	const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000);
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	return new Date(ts).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

/** Terse: relative within the hour, then time of day (the day header carries the date). */
export function timeLabel(ts: number, now: number): string {
	const mins = Math.floor((now - ts) / 60_000);
	if (mins < 1) return "now";
	if (mins < 60) return `${mins} min`;
	return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
