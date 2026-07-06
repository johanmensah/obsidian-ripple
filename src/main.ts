import { initAI } from "@obsidian-ai-providers/sdk";
import { EventRef, Plugin, debounce } from "obsidian";
import { JournalStore } from "./services/journal-store";
import { DEFAULT_SETTINGS, RippleSettingTab, RippleSettings, UiState } from "./settings";
import { FeedView, VIEW_TYPE_FEED } from "./view/FeedView";
import { NavView, VIEW_TYPE_NAV } from "./view/NavView";

export default class RipplePlugin extends Plugin {
	settings: RippleSettings = DEFAULT_SETTINGS;
	ui: UiState = {};
	private store: JournalStore | null = null;
	private storeRefs = 0;
	private storeEventRefs: EventRef[] = [];
	private unsubscribeUiSave: (() => void) | null = null;
	/** Right sidebar's collapsed state before Ripple opened; null when not captured. */
	private priorRightCollapsed: boolean | null = null;

	private readonly saveUi = debounce(
		() => {
			const snap = this.store?.getSnapshot();
			if (!snap) return;
			const next: UiState = {
				monthFilter: snap.monthFilter,
				tagFilter: snap.tagFilter,
				highlightFilter: snap.highlightFilter,
				collapsedYears: this.ui.collapsedYears,
			};
			if (JSON.stringify(next) === JSON.stringify(this.ui)) return;
			this.ui = next;
			void this.saveData({ ...this.settings, ui: this.ui });
		},
		500,
		true,
	);

	async onload(): Promise<void> {
		// initAI readies the AI Providers bridge; with the fallback disabled it
		// changes nothing when the plugin is absent — reflect degrades instead.
		await initAI(
			this.app,
			this,
			async () => {
				await this.loadSettings();
				this.registerView(VIEW_TYPE_FEED, (leaf) => new FeedView(leaf, this));
				this.registerView(VIEW_TYPE_NAV, (leaf) => new NavView(leaf, this));
				this.addRibbonIcon("notebook-pen", "Ripple", () => void this.toggleJournal());
				this.addCommand({
					id: "open-journal",
					name: "Open journal",
					callback: () => void this.activateJournal(),
				});
				this.addCommand({
					id: "new-post",
					name: "New post",
					callback: async () => {
						await this.activateJournal();
						const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_FEED)[0]?.view;
						if (view instanceof FeedView) view.focusComposer();
					},
				});
				this.addSettingTab(new RippleSettingTab(this.app, this));
				// Restore runs here rather than in View.onClose: plugin unload keeps
				// leaves in place and fires no layout-change, so this never runs at unload.
				this.registerEvent(
					this.app.workspace.on("layout-change", () => this.onLayoutChange()),
				);
			},
			{ disableFallback: true },
		);
	}

	/** The ribbon toggles: open Ripple, or close it and return to the prior view. */
	async toggleJournal(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FEED);
		if (leaves.length > 0) {
			// User-driven close; the layout-change handler detaches the nav and
			// restores the right sidebar.
			for (const leaf of leaves) leaf.detach();
			return;
		}
		await this.activateJournal();
	}

	/** One store shared by the nav and feed views; vault listeners live only
	 * while at least one Ripple view is open. */
	acquireStore(): JournalStore {
		if (!this.store) {
			this.store = new JournalStore(this.app, this.settings.journalFolder, this.ui);
			this.storeEventRefs = this.store.events();
			// registerEvent is the unload safety net; releaseStore offrefs earlier.
			for (const ref of this.storeEventRefs) this.registerEvent(ref);
			this.unsubscribeUiSave = this.store.subscribe(() => this.saveUi());
			this.store.rebuild();
		}
		this.storeRefs++;
		return this.store;
	}

	releaseStore(): void {
		this.storeRefs = Math.max(0, this.storeRefs - 1);
		if (this.storeRefs > 0 || !this.store) return;
		this.unsubscribeUiSave?.();
		this.unsubscribeUiSave = null;
		// offref delegates to each ref's own emitter, so one call site covers
		// vault and metadataCache refs alike; the later unload offref is a no-op.
		for (const ref of this.storeEventRefs) this.app.vault.offref(ref);
		this.storeEventRefs = [];
		this.store.destroy();
		this.store = null;
	}

	async setJournalFolder(path: string): Promise<void> {
		this.settings.journalFolder = path;
		await this.saveSettings();
		this.store?.setFolder(path);
	}

	async activateJournal(): Promise<void> {
		const { workspace } = this.app;
		if (
			workspace.getLeavesOfType(VIEW_TYPE_FEED).length === 0 &&
			this.priorRightCollapsed === null
		) {
			this.priorRightCollapsed = workspace.rightSplit?.collapsed ?? true;
		}
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_FEED)[0];
		if (!leaf) {
			leaf = workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_FEED, active: true });
		}
		await workspace.revealLeaf(leaf);
		// The nav becomes the left sidebar's visible tab, in place of the file
		// navigator; reveal also expands a collapsed sidebar.
		await workspace.ensureSideLeaf(VIEW_TYPE_NAV, "left", { reveal: true });
		workspace.rightSplit?.collapse();
		if (leaf.view instanceof FeedView) leaf.view.focusRoot();
	}

	private onLayoutChange(): void {
		const { workspace } = this.app;
		const open = workspace.getLeavesOfType(VIEW_TYPE_FEED).length > 0;
		if (open && this.priorRightCollapsed === null) {
			// Feed arrived via workspace restore; adopt the current state as prior.
			this.priorRightCollapsed = workspace.rightSplit?.collapsed ?? true;
		} else if (!open && this.priorRightCollapsed !== null) {
			// Detaching the nav leaf hands the left sidebar back to its previous tab.
			for (const leaf of workspace.getLeavesOfType(VIEW_TYPE_NAV)) leaf.detach();
			if (!this.priorRightCollapsed) workspace.rightSplit?.expand();
			this.priorRightCollapsed = null;
		}
	}

	ensureJournalOpen(): void {
		if (this.app.workspace.getLeavesOfType(VIEW_TYPE_FEED).length > 0) return;
		void this.activateJournal();
	}

	async loadSettings(): Promise<void> {
		// loadData is typed any upstream; the shape is ours.
		const raw = ((await this.loadData()) ?? {}) as Partial<RippleSettings> & { ui?: UiState };
		const { ui, ...rest } = raw;
		this.settings = { ...DEFAULT_SETTINGS, ...rest };
		this.ui = ui ?? {};
	}

	async saveSettings(): Promise<void> {
		await this.saveData({ ...this.settings, ui: this.ui });
	}
}
