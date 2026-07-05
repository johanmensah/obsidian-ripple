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
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
		this.plugin.releaseStore();
	}
}
