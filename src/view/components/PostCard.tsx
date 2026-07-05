import { Menu } from "obsidian";
import { MouseEvent, useEffect, useState } from "react";
import { timeLabel } from "../../services/journal-model";
import { Thread } from "../../types";
import { usePlugin } from "../context";
import { Composer } from "./Composer";
import { Icon } from "./Icon";
import { MarkdownPane } from "./MarkdownPane";
import { TagChip } from "./TagChip";

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
	onSelect,
	onTagClick,
	onRequestEdit,
	onEditDone,
	onOpen,
	onDelete,
}: {
	thread: Thread;
	isCursor: boolean;
	isEditing: boolean;
	onSelect: () => void;
	onTagClick: (tag: string) => void;
	onRequestEdit: () => void;
	onEditDone: (body: string | null) => void;
	onOpen: () => void;
	onDelete: () => void;
}) {
	const { root, replies } = thread;

	const showMenu = (e: MouseEvent) => {
		e.stopPropagation();
		const menu = new Menu();
		menu.addItem((item) => item.setTitle("Edit").setIcon("pencil").onClick(onRequestEdit));
		menu.addItem((item) => item.setTitle("Open as note").setIcon("file-symlink").onClick(onOpen));
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle("Delete").setIcon("trash-2").setWarning(true).onClick(onDelete),
		);
		menu.showAtMouseEvent(e.nativeEvent);
	};

	return (
		<article
			className={`ripple-post${isCursor ? " is-cursor" : ""}`}
			data-path={root.path}
			onClick={(e) => {
				if (e.metaKey || e.ctrlKey) onOpen();
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
				{replies.length > 0 && (
					<span className="ripple-post-replies">
						{replies.length === 1 ? "1 reply" : `${replies.length} replies`}
					</span>
				)}
				<button
					className="clickable-icon ripple-post-menu"
					aria-label="Post actions"
					onClick={showMenu}
				>
					<Icon name="more-horizontal" />
				</button>
			</footer>
		</article>
	);
}
