import { EventRef, Plugin, debounce } from "obsidian";
import { JournalStore } from "./services/journal-store";
import { DEFAULT_SETTINGS, RippleSettingTab, RippleSettings, UiState } from "./settings";
import { FeedView, VIEW_TYPE_FEED } from "./view/FeedView";

export default class RipplePlugin extends Plugin {
	settings: RippleSettings = DEFAULT_SETTINGS;
	ui: UiState = {};
	private store: JournalStore | null = null;
	private storeRefs = 0;
	private storeEventRefs: EventRef[] = [];
	private unsubscribeUiSave: (() => void) | null = null;

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
		await this.loadSettings();
		this.registerView(VIEW_TYPE_FEED, (leaf) => new FeedView(leaf, this));
		this.addCommand({
			id: "open-journal",
			name: "Open journal",
			callback: () => void this.activateJournal(),
		});
		this.addSettingTab(new RippleSettingTab(this.app, this));
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
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_FEED)[0];
		if (!leaf) {
			leaf = workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_FEED, active: true });
		}
		await workspace.revealLeaf(leaf);
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
