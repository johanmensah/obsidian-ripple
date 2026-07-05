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
 * Collapses posts into top-level threads, newest-first; replies oldest-first.
 * A reply whose parent is missing renders top-level (the cache settles a tick
 * later); a reply to a reply attaches to its thread root.
 */
export function assembleThreads(posts: Post[]): Thread[] {
	const byPath = new Map(posts.map((p) => [p.path, p]));
	const roots: Post[] = [];
	const replies: Post[] = [];
	for (const post of posts) {
		if (post.replyTo && byPath.has(post.replyTo)) replies.push(post);
		else roots.push(post);
	}
	const threads = new Map(roots.map((root) => [root.path, { root, replies: [] as Post[] }]));
	for (const reply of replies) {
		const root = rootOf(reply, byPath);
		const thread = threads.get(root.path);
		if (thread) thread.replies.push(reply);
		else threads.set(reply.path, { root: reply, replies: [] }); // reply cycle: no root exists
	}
	const list = [...threads.values()];
	for (const thread of list) thread.replies.sort((a, b) => a.created - b.created);
	list.sort((a, b) => b.root.created - a.root.created || b.root.path.localeCompare(a.root.path));
	return list;
}

function rootOf(post: Post, byPath: Map<string, Post>): Post {
	let current = post;
	const seen = new Set([current.path]);
	while (current.replyTo) {
		const parent = byPath.get(current.replyTo);
		if (!parent || seen.has(parent.path)) break;
		seen.add(parent.path);
		current = parent;
	}
	return current;
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
