import { Menu } from "obsidian";
import { MouseEvent, useEffect, useState } from "react";
import { timeLabel } from "../../services/journal-model";
import { Thread } from "../../types";
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
			if (alive) setInitial(text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ""));
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
	onOpenPath: (path: string) => void;
	onDeletePath: (path: string) => void;
}) {
	const { root, replies } = thread;

	const showMenu = (e: MouseEvent) => {
		e.stopPropagation();
		const menu = new Menu();
		menu.addItem((item) => item.setTitle("Reply").setIcon("reply").onClick(onRequestReply));
		menu.addItem((item) => item.setTitle("Edit").setIcon("pencil").onClick(onRequestEdit));
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
			className={`ripple-post${isCursor ? " is-cursor" : ""}`}
			data-path={root.path}
			onClick={(e) => {
				if (e.metaKey || e.ctrlKey) onOpenPath(root.path);
				else onSelect();
			}}
		>
			{isEditing ? (
				<EditBody path={root.path} onDone={onEditDone} />
			) : (
				<MarkdownPane path={root.path} mtime={root.mtime} />
			)}
			<footer className="ripple-post-meta">
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
			</footer>
			{(replies.length > 0 || isReplying) && (
				<ThreadedReplies
					replies={replies}
					replying={isReplying}
					onReplySubmit={onReplySubmit}
					onReplyCancel={onReplyCancel}
					onOpen={onOpenPath}
					onDelete={onDeletePath}
				/>
			)}
		</article>
	);
}
