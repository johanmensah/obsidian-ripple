import { Keymap, Notice, TFile, normalizePath } from "obsidian";
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
import { groupByDay, monthKeyOf, mostRecentPost } from "../services/journal-model";
import { Icon } from "./components/Icon";
import { JournalStore } from "../services/journal-store";
import {
	createPost,
	exportFileName,
	exportThreadAsNote,
	nameSuggestion,
	promotePost,
	renamePost,
	saveEdit,
	setHighlight,
	splitFrontmatter,
} from "../services/post-io";
import { getAI, reflect, reflectionText, waitForAIReady } from "../services/reflect";
import {
	HIGHLIGHT_COLOURS,
	HighlightColour,
	Post,
	ReflectionScope,
	Thread,
} from "../types";
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

function threadContains(thread: Thread, path: string): boolean {
	return thread.root.path === path || thread.replies.some((reply) => reply.path === path);
}

function branchAsThread(thread: Thread, terminalPath: string): Thread {
	const byPath = new Map([thread.root, ...thread.replies].map((post) => [post.path, post]));
	const replies: Post[] = [];
	const visited = new Set<string>();
	let current = byPath.get(terminalPath);
	while (current && current.path !== thread.root.path && !visited.has(current.path)) {
		visited.add(current.path);
		replies.unshift(current);
		current = current.replyTo ? byPath.get(current.replyTo) : undefined;
	}
	if (!current || current.path !== thread.root.path) {
		throw new Error(`Ripple: export branch left its thread: ${terminalPath}`);
	}
	return { root: thread.root, replies };
}

function visibleAsThread(thread: Thread, visiblePaths: readonly string[]): Thread {
	const visible = new Set(visiblePaths);
	return {
		root: thread.root,
		replies: thread.replies.filter((reply) => visible.has(reply.path)),
	};
}

export function FeedApp({ store }: { store: JournalStore }) {
	const plugin = usePlugin();
	const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const pending = useSyncExternalStore(
		plugin.subscribeReflectionRun,
		plugin.getReflectionRun,
	);
	const rootRef = useRef<HTMLDivElement>(null);
	const composerBoxRef = useRef<HTMLDivElement>(null);
	const [cursor, setCursor] = useState<string | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [replying, setReplying] = useState<TFile | null>(null);
	const [aiReady, setAiReady] = useState(false);

	useEffect(() => {
		let alive = true;
		void waitForAIReady()
			.then(() => {
				if (alive) setAiReady(true);
			})
			.catch((err: unknown) => {
				if (alive) console.error("Ripple: AI Providers readiness failed", err);
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
	const targetIsAvailable = (file: TFile) => {
		const folder = normalizePath(plugin.settings.journalFolder);
		return (
			plugin.app.vault.getFileByPath(file.path) === file &&
			(folder === "" || file.path.startsWith(`${folder}/`))
		);
	};

	const openAsNote = (path: string) => {
		const file = fileOf(path);
		if (file) void plugin.app.workspace.getLeaf("tab").openFile(file);
	};

	const exportThread = (
		thread: Thread,
		kind: "thread" | "branch",
		depths: ReadonlyMap<string, number>,
	) => {
		const fileName = exportFileName(
			thread.root.basename,
			kind,
			plugin.settings.exportFilenameTemplate,
			plugin.settings.exportFilenameDateTimeFormat,
			new Date(),
		);
		const performExport = (name: string) => {
			void (async () => {
				try {
					const file = await exportThreadAsNote(
						plugin.app,
						thread,
						plugin.settings.journalFolder,
						{
							userName: plugin.settings.exportUserName,
							reflectionName: plugin.settings.exportReflectionName,
							lineTemplate: plugin.settings.exportLineTemplate,
							noteDateFormat: plugin.settings.exportNoteDateFormat,
							noteTimeFormat: plugin.settings.exportNoteTimeFormat,
							depths,
						},
						name,
					);
					await plugin.app.workspace.getLeaf("tab").openFile(file);
				} catch (err) {
					console.error(`Ripple: export ${kind} failed`, err);
					new Notice(`Could not export the ${kind}.`);
				}
			})();
		};
		if (plugin.settings.exportPromptForName) {
			new NameModal(plugin.app, fileName, performExport, {
				title: kind === "branch" ? "Name branch export" : "Name thread export",
				submitLabel: "Export",
			}).open();
			return;
		}
		performExport(fileName);
	};

	const exportBranch = (
		thread: Thread,
		terminalPath: string,
		visiblePaths: readonly string[],
		depths: ReadonlyMap<string, number>,
	) => {
		try {
			exportThread(
				visibleAsThread(branchAsThread(thread, terminalPath), visiblePaths),
				"branch",
				depths,
			);
		} catch (err) {
			console.error("Ripple: export branch failed", err);
			new Notice("Could not export the branch.");
		}
	};

	const submitPost = async (body: string): Promise<boolean> => {
		try {
			await createPost(plugin.app, snap.journalFolder, body);
			return true;
		} catch (err) {
			console.error("Ripple: create post failed", err);
			new Notice("Could not create the post.");
			return false;
		}
	};

	const requestReply = (path: string) => {
		const target = fileOf(path);
		if (target) setReplying(target);
	};

	const submitReply = async (body: string): Promise<boolean> => {
		const target = replying;
		if (!target) return false;
		if (!targetIsAvailable(target)) {
			new Notice("The parent note is no longer in the Ripple folder.");
			return false;
		}
		try {
			await createPost(plugin.app, store.getSnapshot().journalFolder, body, {
				replyTo: target,
			});
			setReplying(null);
			return true;
		} catch (err) {
			console.error("Ripple: create reply failed", err, target.path);
			new Notice("Could not create the reply.");
			return false;
		}
	};

	const finishEdit = async (path: string, body: string | null): Promise<boolean> => {
		if (body === null) {
			setEditing(null);
			return true;
		}
		const file = fileOf(path);
		if (!file) {
			new Notice("The note is no longer in the Ripple folder.");
			return false;
		}
		try {
			await saveEdit(plugin.app, file, body);
			setEditing(null);
			return true;
		} catch (err) {
			console.error("Ripple: save edit failed", err);
			new Notice("Could not save the edit.");
			return false;
		}
	};

	const namePost = (path: string, rootPath = path) => {
		const file = fileOf(path);
		if (!file) return;
		const rootFile = fileOf(rootPath);
		const isRoot = path === rootPath;
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
						setCursor(isRoot ? file.path : (rootFile?.path ?? rootPath));
					})
					.catch((err: unknown) => {
						console.error("Ripple: rename failed", err);
						new Notice("Could not rename the note.");
					});
			}).open();
		});
	};

	const promoteToParent = (path: string) => {
		const file = fileOf(path);
		if (!file) return;
		void promotePost(plugin.app, file).catch((err: unknown) => {
			console.error("Ripple: promote note failed", err);
			new Notice("Could not promote the note.");
		});
	};

	const confirmDelete = (path: string, hasReplies: boolean) => {
		const file = fileOf(path);
		if (!file) return;
		const message =
			hasReplies
				? "Delete this post? Its child branches will remain as separate threads."
				: "Delete this post?";
		new ConfirmModal(plugin.app, message, "Delete", () => {
			void plugin.app.fileManager.trashFile(file).catch((err: unknown) => {
				console.error("Ripple: delete failed", err);
				new Notice("Could not delete the post.");
			});
		}).open();
	};

	const confirmDeleteThread = (thread: Thread) => {
		const posts = [thread.root, ...thread.replies];
		const files = posts
			.map((post) => fileOf(post.path))
			.filter((file): file is TFile => file !== null);
		if (files.length !== posts.length) {
			new Notice("Could not find every note in the thread.");
			return;
		}
		const count = files.length;
		new ConfirmModal(
			plugin.app,
			`Delete this entire thread? All ${count} notes will be moved to the trash.`,
			"Delete thread",
			() => {
				void (async () => {
					if (files.some((file) => !targetIsAvailable(file))) {
						new Notice("The thread changed before it could be deleted.");
						return;
					}
					try {
						for (const file of files.reverse()) {
							await plugin.app.fileManager.trashFile(file);
						}
					} catch (err) {
						console.error("Ripple: delete thread failed", err);
						new Notice("Could not delete the whole thread.");
					}
				})();
			},
		).open();
	};

	const reflectOn = (thread: Thread, sourcePath: string, scope: ReflectionScope) => {
		if (plugin.getReflectionRun()) return;
		const source = fileOf(sourcePath);
		if (!source) {
			new Notice("Could not find the note to reflect on.");
			return;
		}
		const anchor = source;
		const abort = new AbortController();
		plugin.setReflectionRun({
			target: anchor,
			providerName: "Preparing reflection",
			text: "",
			abort,
		});
		void (async () => {
			try {
				const ai = await getAI();
				if (abort.signal.aborted) return;
				if (!ai) {
					new Notice("Install and configure the AI Providers plugin to enable reflections.");
					return;
				}
				const provider = ai.providers.find((p) => p.id === plugin.settings.aiProviderId);
				if (!provider) {
					new Notice("Choose an AI provider in Ripple's settings.");
					return;
				}
				// Renames mutate this TFile in place, preserving the placement anchor.
				plugin.setReflectionRun({ target: anchor, providerName: provider.name, text: "", abort });
				const text = await reflect({
					ai,
					provider,
					systemPrompt: plugin.settings.reflectionPrompt,
					prompt: await reflectionText(plugin.app, thread, source.path, scope),
					onProgress: (accumulated) => {
						const run = plugin.getReflectionRun();
						if (run?.abort === abort) plugin.setReflectionRun({ ...run, text: accumulated });
					},
					abortController: abort,
				});
				if (abort.signal.aborted) return;
				// The file exists only once there is a final text; abort writes nothing.
				// Folder is re-read at write time (settings can change mid-stream).
				if (text.trim()) {
					if (!targetIsAvailable(anchor)) {
						new Notice("The reflection anchor is no longer in the Ripple folder.");
						return;
					}
					await createPost(plugin.app, plugin.settings.journalFolder, text, {
						replyTo: anchor,
						ai: true,
					});
				}
			} catch (err) {
				if (!abort.signal.aborted) {
					console.error("Ripple: reflection failed", err);
					new Notice("The reflection failed.");
				}
			} finally {
				if (plugin.getReflectionRun()?.abort === abort) plugin.setReflectionRun(null);
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

	const cycleHighlight = (post: Post) => {
		const idx = post.highlight ? HIGHLIGHT_COLOURS.indexOf(post.highlight) : -1;
		applyHighlight(post.path, HIGHLIGHT_COLOURS[idx + 1] ?? null);
	};

	const focusComposer = () => {
		composerBoxRef.current?.querySelector("textarea")?.focus();
	};

	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const target = e.target as HTMLElement;
		if (target.closest("textarea, input, [contenteditable=true], button")) return;
		const selectedThread = cursor ? snap.threads.find((t) => t.root.path === cursor) : undefined;
		const selectedPost = selectedThread ? mostRecentPost(selectedThread) : null;
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
				if (selectedPost) {
					e.preventDefault();
					setEditing(selectedPost.path);
				}
				break;
			case "o":
				if (selectedPost) openAsNote(selectedPost.path);
				break;
			case "r":
				if (selectedPost) {
					e.preventDefault();
					requestReply(selectedPost.path);
				}
				break;
			case "h":
				if (selectedPost) {
					e.preventDefault();
					cycleHighlight(selectedPost);
				}
				break;
			case "t":
				if (selectedThread && selectedPost) {
					e.preventDefault();
					namePost(selectedPost.path, selectedThread.root.path);
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
						<h2 className="ripple-day-header">
							<span>{group.label}</span>
						</h2>
						{group.threads.map((thread) => (
							<PostCard
								key={thread.root.path}
								thread={thread}
								isCursor={cursor === thread.root.path}
								editingPath={editing}
								replyingTo={
									replying && threadContains(thread, replying.path)
										? replying.path
										: null
								}
								onSelect={() => setCursor(thread.root.path)}
								onTagClick={(tag) =>
									store.setTagFilter(snap.tagFilter === tag ? null : tag)
								}
								onRequestEdit={setEditing}
								onRequestName={(path) => namePost(path, thread.root.path)}
								onEditDone={finishEdit}
								onRequestReply={requestReply}
								onRequestExport={(visiblePaths, depths) =>
									exportThread(visibleAsThread(thread, visiblePaths), "thread", depths)
								}
								onRequestExportBranch={(path, visiblePaths, depths) =>
									exportBranch(thread, path, visiblePaths, depths)
								}
								onReplySubmit={submitReply}
								onReplyCancel={() => setReplying(null)}
								onSetHighlight={applyHighlight}
								reflectEnabled={
									(aiReady || plugin.settings.aiProviderId !== null) && !pending
								}
								pendingReflection={
									pending && threadContains(thread, pending.target.path)
										? {
												targetPath: pending.target.path,
												providerName: pending.providerName,
												text: pending.text,
											}
										: null
								}
								onRequestReflect={(path, scope) => reflectOn(thread, path, scope)}
								onStopReflection={() => plugin.stopReflection()}
								onPromotePath={promoteToParent}
								onOpenPath={openAsNote}
								onDeleteThread={() => confirmDeleteThread(thread)}
								onDeletePath={(path) =>
									confirmDelete(
										path,
										thread.replies.some((reply) => reply.replyTo === path),
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
