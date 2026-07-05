import { ItemView, WorkspaceLeaf } from "obsidian";
import { StrictMode } from "react";
import { createRoot, Root } from "react-dom/client";
import type RipplePlugin from "../main";
import { Sidebar } from "./components/Sidebar";
import { PluginContext } from "./context";

export const VIEW_TYPE_NAV = "ripple-nav";

export class NavView extends ItemView {
	private root: Root | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: RipplePlugin,
	) {
		super(leaf);
		this.navigation = false;
	}

	getViewType(): string {
		return VIEW_TYPE_NAV;
	}

	getDisplayText(): string {
		return "Ripple";
	}

	getIcon(): string {
		return "notebook-pen";
	}

	async onOpen(): Promise<void> {
		const store = this.plugin.acquireStore();
		this.contentEl.addClass("ripple-nav");
		this.root = createRoot(this.contentEl);
		this.root.render(
			<StrictMode>
				<PluginContext.Provider value={this.plugin}>
					<Sidebar store={store} />
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
