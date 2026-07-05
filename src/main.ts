import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, RippleSettingTab, RippleSettings, UiState } from "./settings";

export default class RipplePlugin extends Plugin {
	settings: RippleSettings = DEFAULT_SETTINGS;
	ui: UiState = {};

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new RippleSettingTab(this.app, this));
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
