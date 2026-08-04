import { Menu } from "obsidian";
import { MouseEvent } from "react";
import { HIGHLIGHT_COLOURS, HighlightColour, Post } from "../../types";
import { Icon } from "./Icon";

export interface CollapseToggle {
	collapsed: boolean;
	hiddenCount: number;
	onToggle: () => void;
}

export function PostMenuButton({
	post,
	expanded,
	reflectEnabled,
	onReply,
	onReflect,
	threadReflection,
	exportAction,
	onEdit,
	onName,
	onPromote,
	branchToggle,
	subtreeToggle,
	flattenBranches,
	onSetHighlight,
	onOpen,
	onDeleteThread,
	onDelete,
}: {
	post: Post;
	expanded: boolean;
	reflectEnabled: boolean;
	onReply: () => void;
	onReflect: () => void;
	threadReflection?: { title: string; onClick: () => void };
	exportAction?: { title: string; onClick: () => void };
	onEdit: () => void;
	onName: () => void;
	onPromote?: () => void;
	branchToggle?: CollapseToggle;
	subtreeToggle?: CollapseToggle;
	flattenBranches?: Array<{ title: string; active: boolean; onClick: () => void }>;
	onSetHighlight: (colour: HighlightColour | null) => void;
	onOpen: () => void;
	onDeleteThread?: () => void;
	onDelete: () => void;
}) {
	const showMenu = (e: MouseEvent) => {
		e.stopPropagation();
		const menu = new Menu();
		menu.addItem((item) => item.setTitle("Reply").setIcon("reply").onClick(onReply));
		menu.addItem((item) =>
			item
				.setTitle("Reflect on this note")
				.setIcon("sparkles")
				.setDisabled(!reflectEnabled)
				.onClick(onReflect),
		);
		if (threadReflection) {
			menu.addItem((item) =>
				item
					.setTitle(threadReflection.title)
					.setIcon("messages-square")
					.setDisabled(!reflectEnabled)
					.onClick(threadReflection.onClick),
			);
		}
		if (branchToggle) {
			menu.addItem((item) =>
				item
					.setTitle(branchToggle.collapsed ? "Expand branch" : "Collapse branch")
					.setIcon("circle-dot")
					.onClick(branchToggle.onToggle),
			);
		}
		if (subtreeToggle) {
			menu.addItem((item) =>
				item
					.setTitle(subtreeToggle.collapsed ? "Expand notes below" : "Collapse notes below")
					.setIcon(subtreeToggle.collapsed ? "unfold-vertical" : "fold-vertical")
					.onClick(subtreeToggle.onToggle),
			);
		}
		for (const branch of flattenBranches ?? []) {
			menu.addItem((item) =>
				item
					.setTitle(branch.active ? "Restore main branch" : branch.title)
					.setIcon(branch.active ? "undo-2" : "git-branch")
					.onClick(branch.onClick),
			);
		}
		if (exportAction) {
			menu.addItem((item) =>
				item.setTitle(exportAction.title).setIcon("file-output").onClick(exportAction.onClick),
			);
		}
		menu.addSeparator();
		menu.addItem((item) => item.setTitle("Edit").setIcon("pencil").onClick(onEdit));
		menu.addItem((item) =>
			item.setTitle("Name…").setIcon("text-cursor-input").onClick(onName),
		);
		if (onPromote) {
			menu.addItem((item) =>
				item
					.setTitle("Promote to parent note")
					.setIcon("arrow-up-to-line")
					.onClick(onPromote),
			);
		}
		if (expanded) {
			const event = e.nativeEvent;
			menu.addItem((item) =>
				item.setTitle("Highlight…").setIcon("highlighter").onClick(() => {
					const colours = new Menu();
					for (const colour of HIGHLIGHT_COLOURS) {
						colours.addItem((colourItem) =>
							colourItem
								.setTitle(colour.charAt(0).toUpperCase() + colour.slice(1))
								.setIcon("circle")
								.setChecked(post.highlight === colour)
								.onClick(() => onSetHighlight(post.highlight === colour ? null : colour)),
						);
					}
					if (post.highlight) {
						colours.addSeparator();
						colours.addItem((colourItem) =>
							colourItem
								.setTitle("Clear")
								.setIcon("circle-off")
								.onClick(() => onSetHighlight(null)),
						);
					}
					colours.showAtMouseEvent(event);
				}),
			);
		}
		menu.addItem((item) => item.setTitle("Open as note").setIcon("file-symlink").onClick(onOpen));
		menu.addSeparator();
		if (onDeleteThread) {
			menu.addItem((item) =>
				item
					.setTitle("Delete thread")
					.setIcon("trash-2")
					.setWarning(true)
					.onClick(onDeleteThread),
			);
		}
		menu.addItem((item) =>
			item.setTitle("Delete").setIcon("trash-2").setWarning(true).onClick(onDelete),
		);
		menu.showAtMouseEvent(e.nativeEvent);
	};

	return (
		<button
			className="clickable-icon ripple-post-menu"
			aria-label="Post and thread actions"
			onClick={showMenu}
		>
			<Icon name="more-horizontal" />
		</button>
	);
}

export function ThreadActionRow({
	reflectEnabled,
	onReply,
	onReflect,
	onReflectThread,
	reflectThreadLabel = "Reflect on thread",
	mobileReflect = false,
}: {
	reflectEnabled: boolean;
	onReply: () => void;
	onReflect: () => void;
	onReflectThread?: () => void;
	reflectThreadLabel?: string;
	mobileReflect?: boolean;
}) {
	return (
		<div className="ripple-post-actions">
			<button className="ripple-action" onClick={onReply}>
				<Icon name="reply" className="ripple-action-icon" />
				Reply
			</button>
			<button
				className={`ripple-action${mobileReflect ? "" : " is-mobile-nonterminal-reflect"}`}
				disabled={!reflectEnabled}
				onClick={onReflect}
			>
				<Icon name="sparkles" className="ripple-action-icon" />
				Reflect
			</button>
			{onReflectThread && (
				<button
					className="ripple-action"
					disabled={!reflectEnabled}
					onClick={onReflectThread}
				>
					<Icon name="messages-square" className="ripple-action-icon" />
					{reflectThreadLabel}
				</button>
			)}
		</div>
	);
}
