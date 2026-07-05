import { Notice } from "obsidian";
import { KeyboardEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ConfirmModal } from "../modals/ConfirmModal";
import { groupByDay } from "../services/journal-model";
import { JournalStore } from "../services/journal-store";
import { createPost, deletePost, saveEdit } from "../services/post-io";
import { usePlugin } from "./context";
import { Composer } from "./components/Composer";
import { PostCard } from "./components/PostCard";

export function FeedApp({ store }: { store: JournalStore }) {
	const plugin = usePlugin();
	const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const rootRef = useRef<HTMLDivElement>(null);
	const composerBoxRef = useRef<HTMLDivElement>(null);
	const [cursor, setCursor] = useState<string | null>(null);
	const [editing, setEditing] = useState<string | null>(null);

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

	const confirmDelete = (path: string, replyCount: number) => {
		const file = fileOf(path);
		if (!file) return;
		const message =
			replyCount > 0
				? "Delete this post? Its replies remain as posts of their own."
				: "Delete this post?";
		new ConfirmModal(plugin.app, message, "Delete", () => {
			void deletePost(plugin.app, file).catch((err: unknown) => {
				console.error("Ripple: delete failed", err);
				new Notice("Could not delete the post.");
			});
		}).open();
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

	const groups = groupByDay(snap.threads, Date.now());

	return (
		<div className="ripple-app" ref={rootRef} tabIndex={0} onKeyDown={onKeyDown}>
			<div className="ripple-column">
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
								onSelect={() => setCursor(thread.root.path)}
								onTagClick={(tag) =>
									store.setTagFilter(snap.tagFilter === tag ? null : tag)
								}
								onRequestEdit={() => setEditing(thread.root.path)}
								onEditDone={(body) => finishEdit(thread.root.path, body)}
								onOpen={() => openAsNote(thread.root.path)}
								onDelete={() => confirmDelete(thread.root.path, thread.replies.length)}
							/>
						))}
					</section>
				))}
			</div>
		</div>
	);
}
