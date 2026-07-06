import { Keymap, Notice } from "obsidian";
import {
	KeyboardEvent,
	MouseEvent,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { ConfirmModal } from "../modals/ConfirmModal";
import { NameModal } from "../modals/NameModal";
import { groupByDay, monthKeyOf } from "../services/journal-model";
import { Icon } from "./components/Icon";
import { JournalStore } from "../services/journal-store";
import {
	createPost,
	nameSuggestion,
	renamePost,
	saveEdit,
	setHighlight,
	splitFrontmatter,
} from "../services/post-io";
import { getAI, reflect, threadText } from "../services/reflect";
import { HIGHLIGHT_COLOURS, HighlightColour, Thread } from "../types";
import { usePlugin } from "./context";
import { Composer } from "./components/Composer";
import { PostCard } from "./components/PostCard";

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
	return (
		<span
			role="button"
			tabIndex={0}
			className="ripple-filter-chip"
			onClick={onClear}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClear();
				}
			}}
		>
			{label}
			<Icon name="x" className="ripple-filter-x" />
		</span>
	);
}

export function FeedApp({ store }: { store: JournalStore }) {
	const plugin = usePlugin();
	const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const rootRef = useRef<HTMLDivElement>(null);
	const composerBoxRef = useRef<HTMLDivElement>(null);
	const [cursor, setCursor] = useState<string | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [replying, setReplying] = useState<string | null>(null);
	const [aiReady, setAiReady] = useState(false);
	const [pending, setPending] = useState<{
		rootPath: string;
		providerName: string;
		text: string;
		abort: AbortController;
	} | null>(null);

	useEffect(() => {
		let alive = true;
		void getAI().then((ai) => {
			if (alive) setAiReady(ai !== null);
		});
		return () => {
			alive = false;
		};
	}, []);

	// Keyboard navigation works from the moment the journal opens.
	useEffect(() => {
		rootRef.current?.focus({ preventScroll: true });
	}, []);

	// Day headers and relative times drift without a clock; tick once a minute.
	const [, setMinute] = useState(0);
	useEffect(() => {
		const id = window.setInterval(() => setMinute((m) => m + 1), 60_000);
		return () => window.clearInterval(id);
	}, []);

	// A fresh filter starts reading from the top.
	useEffect(() => {
		rootRef.current?.closest(".ripple-feed")?.scrollTo({ top: 0 });
	}, [snap.monthFilter, snap.tagFilter, snap.highlightFilter]);

	// The scrubber tracks whichever month owns the first post in view.
	const [scrollMonth, setScrollMonth] = useState<string | null>(null);
	useEffect(() => {
		const container = rootRef.current?.closest(".ripple-feed");
		if (!(container instanceof HTMLElement)) return;
		let ticking = false;
		const measure = () => {
			ticking = false;
			const top = container.getBoundingClientRect().top;
			for (const el of container.querySelectorAll("article[data-path]")) {
				if (el.getBoundingClientRect().bottom < top + 80) continue;
				const path = el.getAttribute("data-path");
				const thread = store.getSnapshot().threads.find((t) => t.root.path === path);
				setScrollMonth(thread ? monthKeyOf(thread.root.created) : null);
				return;
			}
			setScrollMonth(null);
		};
		const onScroll = () => {
			if (ticking) return;
			ticking = true;
			window.requestAnimationFrame(measure);
		};
		container.addEventListener("scroll", onScroll, { passive: true });
		measure();
		return () => container.removeEventListener("scroll", onScroll);
	}, [store]);

	const jumpToMonth = (key: string) => {
		const thread = snap.threads.find((t) => monthKeyOf(t.root.created) === key);
		if (!thread) return;
		rootRef.current
			?.querySelector(`[data-path="${CSS.escape(thread.root.path)}"]`)
			?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	const rootPaths = snap.threads.map((t) => t.root.path);

	useEffect(() => {
		if (cursor && !rootPaths.includes(cursor)) setCursor(null);
	}, [cursor, rootPaths.join("\n")]);

	useEffect(() => {
		if (!cursor) return;
		rootRef.current
			?.querySelector(`[data-path="${CSS.escape(cursor)}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [cursor]);

	const fileOf = (path: string) => plugin.app.vault.getFileByPath(path);

	const openAsNote = (path: string) => {
		const file = fileOf(path);
		if (file) void plugin.app.workspace.getLeaf("tab").openFile(file);
	};

	const submitPost = (body: string) => {
		void createPost(plugin.app, snap.journalFolder, body).catch((err: unknown) => {
			console.error("Ripple: create post failed", err);
			new Notice("Could not create the post.");
		});
	};

	const submitReply = (rootPath: string, rootBasename: string, body: string) => {
		setReplying(null);
		void createPost(plugin.app, snap.journalFolder, body, { replyTo: rootBasename }).catch(
			(err: unknown) => {
				console.error("Ripple: create reply failed", err, rootPath);
				new Notice("Could not create the reply.");
			},
		);
	};

	const finishEdit = (path: string, body: string | null) => {
		setEditing(null);
		if (body === null) return;
		const file = fileOf(path);
		if (!file) return;
		void saveEdit(plugin.app, file, body).catch((err: unknown) => {
			console.error("Ripple: save edit failed", err);
			new Notice("Could not save the edit.");
		});
	};

	const namePost = (path: string) => {
		const file = fileOf(path);
		if (!file) return;
		void plugin.app.vault.cachedRead(file).then((text) => {
			// A stamp-named post gets a first-words suggestion; a named one
			// starts from its current name.
			const stampNamed = /^\d{8}-\d{6}$/.test(file.basename);
			const initial = stampNamed
				? nameSuggestion(splitFrontmatter(plugin.app, file, text).body)
				: file.basename;
			new NameModal(plugin.app, initial || file.basename, (name) => {
				void renamePost(plugin.app, file, name)
					.then((renamed) => {
						if (!renamed) {
							new Notice("Could not use that name: empty, unchanged, or already taken.");
							return;
						}
						// fileManager mutates the TFile in place; its path is the new one.
						setCursor(file.path);
					})
					.catch((err: unknown) => {
						console.error("Ripple: rename failed", err);
						new Notice("Could not rename the note.");
					});
			}).open();
		});
	};

	const confirmDelete = (path: string, replyCount: number) => {
		const file = fileOf(path);
		if (!file) return;
		const message =
			replyCount > 0
				? "Delete this post? Its replies remain as posts of their own."
				: "Delete this post?";
		new ConfirmModal(plugin.app, message, "Delete", () => {
			void plugin.app.fileManager.trashFile(file).catch((err: unknown) => {
				console.error("Ripple: delete failed", err);
				new Notice("Could not delete the post.");
			});
		}).open();
	};

	const reflectOn = (thread: Thread) => {
		if (pending) return; // one reflection at a time
		void (async () => {
			const ai = await getAI();
			if (!ai) {
				new Notice("Install and configure the AI Providers plugin to enable reflections.");
				return;
			}
			const provider = ai.providers.find((p) => p.id === plugin.settings.aiProviderId);
			if (!provider) {
				new Notice("Choose an AI provider in Ripple's settings.");
				return;
			}
			const abort = new AbortController();
			// The TFile is captured now because a rename mid-stream mutates its
			// path and basename in place; a path lookup at write time would miss.
			const rootFile = plugin.app.vault.getFileByPath(thread.root.path);
			setPending({ rootPath: thread.root.path, providerName: provider.name, text: "", abort });
			try {
				const text = await reflect({
					ai,
					provider,
					systemPrompt: plugin.settings.reflectionPrompt,
					prompt: await threadText(plugin.app, thread),
					onProgress: (accumulated) =>
						setPending((p) =>
							p && p.rootPath === thread.root.path ? { ...p, text: accumulated } : p,
						),
					abortController: abort,
				});
				// The file exists only once there is a final text; abort writes nothing.
				// Folder is re-read at write time (settings can change mid-stream).
				if (text.trim()) {
					await createPost(plugin.app, store.getSnapshot().journalFolder, text, {
						replyTo: rootFile?.basename ?? thread.root.basename,
						ai: true,
					});
				}
			} catch (err) {
				if (!abort.signal.aborted) {
					console.error("Ripple: reflection failed", err);
					new Notice("The reflection failed.");
				}
			} finally {
				setPending((p) => (p && p.rootPath === thread.root.path ? null : p));
			}
		})();
	};

	const applyHighlight = (path: string, colour: HighlightColour | null) => {
		const file = fileOf(path);
		if (!file) return;
		void setHighlight(plugin.app, file, colour).catch((err: unknown) => {
			console.error("Ripple: set highlight failed", err);
			new Notice("Could not set the highlight.");
		});
	};

	const cycleHighlight = (path: string) => {
		const current = snap.threads.find((t) => t.root.path === path)?.root.highlight ?? null;
		const idx = current ? HIGHLIGHT_COLOURS.indexOf(current) : -1;
		applyHighlight(path, HIGHLIGHT_COLOURS[idx + 1] ?? null);
	};

	const focusComposer = () => {
		composerBoxRef.current?.querySelector("textarea")?.focus();
	};

	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const target = e.target as HTMLElement;
		if (target.closest("textarea, input, [contenteditable=true], button")) return;
		const move = (delta: number) => {
			if (rootPaths.length === 0) return;
			const idx = cursor ? rootPaths.indexOf(cursor) : -1;
			const next =
				idx === -1
					? delta > 0
						? 0
						: rootPaths.length - 1
					: Math.max(0, Math.min(rootPaths.length - 1, idx + delta));
			setCursor(rootPaths[next] ?? null);
		};
		switch (e.key) {
			case "j":
			case "ArrowDown":
				e.preventDefault();
				move(1);
				break;
			case "k":
			case "ArrowUp":
				e.preventDefault();
				move(-1);
				break;
			case "Enter":
				if (cursor) {
					e.preventDefault();
					setEditing(cursor);
				}
				break;
			case "o":
				if (cursor) openAsNote(cursor);
				break;
			case "r":
				if (cursor) {
					e.preventDefault();
					setReplying(cursor);
				}
				break;
			case "h":
				if (cursor) {
					e.preventDefault();
					cycleHighlight(cursor);
				}
				break;
			case "t":
				if (cursor) {
					e.preventDefault();
					namePost(cursor);
				}
				break;
			case "n":
			case "c":
				e.preventDefault();
				focusComposer();
				break;
			case "Escape":
				setCursor(null);
				break;
		}
	};

	// Rendered wikilinks get no click wiring outside a markdown view; delegate.
	const onRootClick = (e: MouseEvent<HTMLDivElement>) => {
		const target = e.target as HTMLElement;
		const anchor = target.closest("a.internal-link");
		if (anchor instanceof HTMLAnchorElement) {
			e.preventDefault();
			const href = anchor.getAttribute("data-href") ?? anchor.getAttribute("href");
			if (!href) return;
			const source = target.closest("[data-path]")?.getAttribute("data-path") ?? "";
			void plugin.app.workspace.openLinkText(href, source, Keymap.isModEvent(e.nativeEvent));
			return;
		}
		// Keyboard keeps working after button clicks (menus, composer actions).
		if (target.closest("button")) rootRef.current?.focus({ preventScroll: true });
	};

	const monthName = (key: string) => {
		const entry = snap.months.find((m) => m.key === key);
		return entry
			? new Date(entry.year, entry.month - 1).toLocaleDateString("en-GB", {
					month: "long",
					year: "numeric",
				})
			: key;
	};

	const groups = groupByDay(snap.threads, Date.now());

	const showScrubber =
		snap.months.length > 1 &&
		snap.monthFilter === null &&
		snap.tagFilter === null &&
		snap.highlightFilter === null;

	return (
		<div
			className="ripple-app"
			ref={rootRef}
			tabIndex={0}
			onKeyDown={onKeyDown}
			onClick={onRootClick}
		>
			{showScrubber && (
				<div className="ripple-scrubber-anchor">
					<div className="ripple-scrubber">
						{snap.months.map((entry) => (
							<span
								key={entry.key}
								role="button"
								tabIndex={-1}
								aria-label={monthName(entry.key)}
								data-label={monthName(entry.key)}
								className={`ripple-scrubber-dot${
									(scrollMonth ?? snap.months[0]?.key) === entry.key
										? " is-active"
										: ""
								}`}
								onClick={(e) => {
									e.stopPropagation();
									jumpToMonth(entry.key);
								}}
							/>
						))}
					</div>
				</div>
			)}
			<div className="ripple-column">
				{(snap.monthFilter !== null ||
					snap.tagFilter !== null ||
					snap.highlightFilter !== null) && (
					<div className="ripple-filter-bar">
						<span>Showing</span>
						{snap.monthFilter && (
							<FilterChip
								label={monthName(snap.monthFilter)}
								onClear={() => store.setMonthFilter(null)}
							/>
						)}
						{snap.tagFilter && (
							<FilterChip
								label={`#${snap.tagFilter}`}
								onClear={() => store.setTagFilter(null)}
							/>
						)}
						{snap.highlightFilter && (
							<FilterChip
								label={
									snap.highlightFilter.charAt(0).toUpperCase() +
									snap.highlightFilter.slice(1)
								}
								onClear={() => store.setHighlightFilter(null)}
							/>
						)}
					</div>
				)}
				<div ref={composerBoxRef}>
					<Composer
						placeholder="What's on your mind?"
						submitLabel="Post"
						onSubmit={submitPost}
					/>
				</div>
				{groups.length === 0 && <div className="ripple-empty">Nothing here yet</div>}
				{groups.map((group) => (
					<section key={group.label} className="ripple-day">
						<h2 className="ripple-day-header">{group.label}</h2>
						{group.threads.map((thread) => (
							<PostCard
								key={thread.root.path}
								thread={thread}
								isCursor={cursor === thread.root.path}
								isEditing={editing === thread.root.path}
								isReplying={replying === thread.root.path}
								onSelect={() => setCursor(thread.root.path)}
								onTagClick={(tag) =>
									store.setTagFilter(snap.tagFilter === tag ? null : tag)
								}
								onRequestEdit={() => setEditing(thread.root.path)}
								onRequestName={() => namePost(thread.root.path)}
								onEditDone={(body) => finishEdit(thread.root.path, body)}
								onRequestReply={() => setReplying(thread.root.path)}
								onReplySubmit={(body) =>
									submitReply(thread.root.path, thread.root.basename, body)
								}
								onReplyCancel={() => setReplying(null)}
								onSetHighlight={(colour) => applyHighlight(thread.root.path, colour)}
								reflectEnabled={
									(aiReady || plugin.settings.aiProviderId !== null) && !pending
								}
								pendingReflection={
									pending && pending.rootPath === thread.root.path
										? { providerName: pending.providerName, text: pending.text }
										: null
								}
								onRequestReflect={() => reflectOn(thread)}
								onStopReflection={() => pending?.abort.abort()}
								onOpenPath={openAsNote}
								onDeletePath={(path) =>
									confirmDelete(
										path,
										path === thread.root.path ? thread.replies.length : 0,
									)
								}
							/>
						))}
					</section>
				))}
			</div>
		</div>
	);
}
