import { ItemView, WorkspaceLeaf } from "obsidian";
import { StrictMode } from "react";
import { createRoot, Root } from "react-dom/client";
import type RipplePlugin from "../main";
import { FeedApp } from "./FeedApp";
import { PluginContext } from "./context";

export const VIEW_TYPE_FEED = "ripple-feed";

export class FeedView extends ItemView {
	private root: Root | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: RipplePlugin,
	) {
		super(leaf);
		this.navigation = true;
	}

	getViewType(): string {
		return VIEW_TYPE_FEED;
	}

	getDisplayText(): string {
		return "Ripple";
	}

	getIcon(): string {
		return "notebook-pen";
	}

	async onOpen(): Promise<void> {
		const store = this.plugin.acquireStore();
		this.contentEl.addClass("ripple-feed");
		this.root = createRoot(this.contentEl);
		this.root.render(
			<StrictMode>
				<PluginContext.Provider value={this.plugin}>
					<FeedApp store={store} />
				</PluginContext.Provider>
			</StrictMode>,
		);
		// Mount-time focus (in FeedApp) misses reveals of an existing leaf;
		// keyboard navigation should work whenever the feed becomes active.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf === this.leaf) this.focusRoot();
			}),
		);
	}

	focusRoot(): void {
		// Deferred: the command palette restores focus to the previous element
		// when it closes, which would immediately undo a synchronous focus.
		window.setTimeout(() => {
			this.contentEl.querySelector<HTMLElement>(".ripple-app")?.focus({ preventScroll: true });
		}, 50);
	}

	/** Retries briefly: right after opening, React may not have mounted yet. */
	focusComposer(): void {
		const attempt = (tries: number) => {
			const el = this.contentEl.querySelector<HTMLTextAreaElement>("textarea");
			if (el) el.focus();
			else if (tries > 0) window.setTimeout(() => attempt(tries - 1), 50);
		};
		attempt(10);
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
		this.plugin.releaseStore();
	}
}
