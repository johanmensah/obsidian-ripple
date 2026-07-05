import {
	App,
	EventRef,
	TAbstractFile,
	TFile,
	TFolder,
	normalizePath,
	parseFrontMatterTags,
} from "obsidian";
import { UiState } from "../settings";
import { HIGHLIGHT_COLOURS, HighlightColour, Post, Thread } from "../types";
import {
	MonthEntry,
	TagEntry,
	assembleThreads,
	countHighlights,
	countMonths,
	countTags,
	monthKeyOf,
} from "./journal-model";

export interface JournalSnapshot {
	/** Filtered top-level threads, newest-first. */
	threads: Thread[];
	/** Top-level post count before filters. */
	allCount: number;
	months: MonthEntry[];
	tagEntries: TagEntry[];
	highlightCounts: Partial<Record<HighlightColour, number>>;
	monthFilter: string | null;
	tagFilter: string | null;
	highlightFilter: HighlightColour | null;
	journalFolder: string;
}

const REBUILD_DEBOUNCE_MS = 50;

/**
 * Reads the journal folder straight from the vault API (no index) and exposes
 * an immutable snapshot for useSyncExternalStore. Nav rows — Timeline, months,
 * highlights, tags — are all filters over one scan. The rest of the vault is
 * invisible: event handlers early-return on paths outside the folder. Vault
 * events are registered by the owning plugin so they live exactly as long as
 * a Ripple view is open.
 */
export class JournalStore {
	private folder: string;
	private readonly listeners = new Set<() => void>();
	private rawPosts: Post[] = [];
	private snapshot: JournalSnapshot;
	private timer: number | null = null;

	constructor(
		private readonly app: App,
		journalFolder: string,
		init: UiState,
	) {
		this.folder = normalizePath(journalFolder);
		this.snapshot = {
			threads: [],
			allCount: 0,
			months: [],
			tagEntries: [],
			highlightCounts: {},
			monthFilter: init.monthFilter ?? null,
			tagFilter: init.tagFilter ?? null,
			highlightFilter: toHighlight(init.highlightFilter ?? null),
			journalFolder: this.folder,
		};
	}

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getSnapshot = (): JournalSnapshot => this.snapshot;

	events(): EventRef[] {
		const touched = (file: TAbstractFile, oldPath?: string) => {
			if (this.inJournal(file.path) || (oldPath !== undefined && this.inJournal(oldPath))) {
				this.scheduleRebuild();
			}
		};
		return [
			this.app.vault.on("create", (f) => touched(f)),
			this.app.vault.on("delete", (f) => touched(f)),
			this.app.vault.on("modify", (f) => touched(f)),
			this.app.vault.on("rename", (f, oldPath) => touched(f, oldPath)),
			this.app.metadataCache.on("changed", (f) => touched(f)),
		];
	}

	destroy(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.listeners.clear();
	}

	setFolder(journalFolder: string): void {
		this.folder = normalizePath(journalFolder);
		this.commit({ journalFolder: this.folder });
		this.rebuild();
	}

	setMonthFilter(monthFilter: string | null): void {
		this.commit({ monthFilter });
	}

	setTagFilter(tagFilter: string | null): void {
		this.commit({ tagFilter });
	}

	setHighlightFilter(highlightFilter: HighlightColour | null): void {
		this.commit({ highlightFilter });
	}

	rebuild(): void {
		const root = this.app.vault.getFolderByPath(this.folder);
		const files: TFile[] = [];
		const collect = (parent: TFolder) => {
			for (const child of parent.children) {
				if (child instanceof TFile) {
					if (child.extension.toLowerCase() === "md") files.push(child);
				} else if (child instanceof TFolder) collect(child);
			}
		};
		if (root) collect(root);
		this.rawPosts = files.map((file) => this.toPost(file));
		this.commit({});
	}

	private inJournal(path: string): boolean {
		return path === this.folder || path.startsWith(this.folder + "/");
	}

	private scheduleRebuild(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.rebuild();
		}, REBUILD_DEBOUNCE_MS);
	}

	private commit(partial: Partial<JournalSnapshot>): void {
		const next = { ...this.snapshot, ...partial };
		const all = assembleThreads(this.rawPosts);
		next.allCount = all.length;
		next.months = countMonths(all);
		next.tagEntries = countTags(this.rawPosts);
		next.highlightCounts = countHighlights(this.rawPosts);
		// A filter that no longer matches anything would strand the view — but a
		// missing folder (mid-typing in settings, not yet created) is not the
		// filters' fault, so they survive until the folder exists again.
		if (this.app.vault.getFolderByPath(this.folder)) {
			if (next.monthFilter && !next.months.some((m) => m.key === next.monthFilter)) {
				next.monthFilter = null;
			}
			if (next.tagFilter && !next.tagEntries.some((t) => t.tag === next.tagFilter)) {
				next.tagFilter = null;
			}
			if (next.highlightFilter && !next.highlightCounts[next.highlightFilter]) {
				next.highlightFilter = null;
			}
		}
		let threads = all;
		if (next.monthFilter) {
			threads = threads.filter((t) => monthKeyOf(t.root.created) === next.monthFilter);
		}
		if (next.tagFilter) {
			const tag = next.tagFilter;
			threads = threads.filter(
				(t) => t.root.tags.includes(tag) || t.replies.some((r) => r.tags.includes(tag)),
			);
		}
		if (next.highlightFilter) {
			threads = threads.filter((t) => t.root.highlight === next.highlightFilter);
		}
		next.threads = threads;
		this.snapshot = next;
		for (const listener of this.listeners) listener();
	}

	private toPost(file: TFile): Post {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const created = fm?.created !== undefined ? Date.parse(String(fm.created)) : NaN;
		const updated = fm?.updated !== undefined ? Date.parse(String(fm.updated)) : NaN;
		return {
			path: file.path,
			basename: file.basename,
			created: Number.isFinite(created) ? created : file.stat.ctime,
			updated: Number.isFinite(updated) ? updated : null,
			tags: fm ? (parseFrontMatterTags(fm) ?? []).map((t) => t.replace(/^#/u, "")) : [],
			highlight: toHighlight(typeof fm?.highlight === "string" ? fm.highlight : null),
			replyTo: this.resolveReplyTo(fm?.reply_to, file.path),
			ai: fm?.ai === true,
			mtime: file.stat.mtime,
		};
	}

	private resolveReplyTo(raw: unknown, sourcePath: string): string | null {
		if (typeof raw !== "string") return null;
		const wikilink = raw.match(/\[\[([^\]|#]+)/u);
		const linktext = (wikilink?.[1] ?? raw).trim();
		if (!linktext) return null;
		return this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)?.path ?? null;
	}
}

function toHighlight(raw: string | null): HighlightColour | null {
	return HIGHLIGHT_COLOURS.find((c) => c === raw) ?? null;
}
