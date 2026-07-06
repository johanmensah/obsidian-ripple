import { Menu } from "obsidian";
import { MouseEvent, useEffect, useState } from "react";
import { timeLabel } from "../../services/journal-model";
import { splitFrontmatter } from "../../services/post-io";
import { HIGHLIGHT_COLOURS, HighlightColour, Thread } from "../../types";
import { usePlugin } from "../context";
import { Composer } from "./Composer";
import { Icon } from "./Icon";
import { MarkdownPane } from "./MarkdownPane";
import { TagChip } from "./TagChip";
import { ThreadedReplies } from "./ThreadedReplies";

function EditBody({ path, onDone }: { path: string; onDone: (body: string | null) => void }) {
	const plugin = usePlugin();
	const [initial, setInitial] = useState<string | null>(null);
	useEffect(() => {
		const file = plugin.app.vault.getFileByPath(path);
		if (!file) return;
		let alive = true;
		void plugin.app.vault.cachedRead(file).then((text) => {
			if (alive) setInitial(splitFrontmatter(plugin.app, file, text).body);
		});
		return () => {
			alive = false;
		};
	}, [path, plugin]);
	if (initial === null) return null;
	return (
		<Composer
			placeholder=""
			initial={initial}
			autoFocus
			submitLabel="Save"
			onSubmit={(body) => onDone(body)}
			onCancel={() => onDone(null)}
		/>
	);
}

export function PostCard({
	thread,
	isCursor,
	isEditing,
	isReplying,
	onSelect,
	onTagClick,
	onRequestEdit,
	onEditDone,
	onRequestReply,
	onReplySubmit,
	onReplyCancel,
	onSetHighlight,
	reflectEnabled,
	pendingReflection,
	onRequestReflect,
	onStopReflection,
	onOpenPath,
	onDeletePath,
}: {
	thread: Thread;
	isCursor: boolean;
	isEditing: boolean;
	isReplying: boolean;
	onSelect: () => void;
	onTagClick: (tag: string) => void;
	onRequestEdit: () => void;
	onEditDone: (body: string | null) => void;
	onRequestReply: () => void;
	onReplySubmit: (body: string) => void;
	onReplyCancel: () => void;
	onSetHighlight: (colour: HighlightColour | null) => void;
	reflectEnabled: boolean;
	pendingReflection: { providerName: string; text: string } | null;
	onRequestReflect: () => void;
	onStopReflection: () => void;
	onOpenPath: (path: string) => void;
	onDeletePath: (path: string) => void;
}) {
	const { root, replies } = thread;
	const hasThread = replies.length > 0 || isReplying || pendingReflection !== null;

	const showMenu = (e: MouseEvent) => {
		e.stopPropagation();
		const menu = new Menu();
		menu.addItem((item) => item.setTitle("Reply").setIcon("reply").onClick(onRequestReply));
		menu.addItem((item) =>
			item
				.setTitle("Reflect")
				.setIcon("sparkles")
				.setDisabled(!reflectEnabled)
				.onClick(onRequestReflect),
		);
		menu.addItem((item) => item.setTitle("Edit").setIcon("pencil").onClick(onRequestEdit));
		// A second menu rather than a submenu: MenuItem.setSubmenu is not in the
		// published API.
		const event = e.nativeEvent;
		menu.addItem((item) =>
			item.setTitle("Highlight…").setIcon("highlighter").onClick(() => {
				const colours = new Menu();
				for (const colour of HIGHLIGHT_COLOURS) {
					colours.addItem((ci) =>
						ci
							.setTitle(colour.charAt(0).toUpperCase() + colour.slice(1))
							.setIcon("circle")
							.setChecked(root.highlight === colour)
							.onClick(() => onSetHighlight(root.highlight === colour ? null : colour)),
					);
				}
				if (root.highlight) {
					colours.addSeparator();
					colours.addItem((ci) =>
						ci.setTitle("Clear").setIcon("circle-off").onClick(() => onSetHighlight(null)),
					);
				}
				colours.showAtMouseEvent(event);
			}),
		);
		menu.addItem((item) =>
			item.setTitle("Open as note").setIcon("file-symlink").onClick(() => onOpenPath(root.path)),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Delete")
				.setIcon("trash-2")
				.setWarning(true)
				.onClick(() => onDeletePath(root.path)),
		);
		menu.showAtMouseEvent(e.nativeEvent);
	};

	return (
		<article
			className={`ripple-post${isCursor ? " is-cursor" : ""}${
				root.highlight ? ` ripple-hl-${root.highlight}` : ""
			}`}
			data-path={root.path}
			onClick={(e) => {
				// Links inside the rendered body belong to the feed-level handler.
				if ((e.target as HTMLElement).closest("a")) return;
				if (e.metaKey || e.ctrlKey) onOpenPath(root.path);
				else onSelect();
			}}
		>
			<div className="ripple-row">
				<div className="ripple-rail">
					<span className="ripple-ball" />
					{hasThread && <div className="ripple-line" />}
				</div>
				<div className="ripple-main">
					<header className="ripple-post-meta">
						<span className="ripple-post-time">{timeLabel(root.created, Date.now())}</span>
						{root.tags.map((tag) => (
							<TagChip key={tag} tag={tag} onClick={onTagClick} />
						))}
						<button
							className="clickable-icon ripple-post-menu"
							aria-label="Post actions"
							onClick={showMenu}
						>
							<Icon name="more-horizontal" />
						</button>
					</header>
					{isEditing ? (
						<EditBody path={root.path} onDone={onEditDone} />
					) : (
						<MarkdownPane path={root.path} mtime={root.mtime} />
					)}
					{!isEditing && (
						<div className="ripple-post-actions">
							<button className="ripple-action" onClick={onRequestReply}>
								<Icon name="reply" className="ripple-action-icon" />
								Reply
							</button>
							<button
								className="ripple-action"
								disabled={!reflectEnabled}
								onClick={onRequestReflect}
							>
								<Icon name="sparkles" className="ripple-action-icon" />
								Reflect
							</button>
						</div>
					)}
				</div>
			</div>
			{hasThread && (
				<ThreadedReplies
					replies={replies}
					replying={isReplying}
					pending={pendingReflection}
					onStopPending={onStopReflection}
					onReplySubmit={onReplySubmit}
					onReplyCancel={onReplyCancel}
					onOpen={onOpenPath}
					onDelete={onDeletePath}
				/>
			)}
		</article>
	);
}
