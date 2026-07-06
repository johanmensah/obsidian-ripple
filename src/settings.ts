import type { IAIProvider } from "@obsidian-ai-providers/sdk";
import {
	App,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	debounce,
	requireApiVersion,
} from "obsidian";
import type RipplePlugin from "./main";
import { FolderPicker } from "./modals/FolderPicker";
import { getAI } from "./services/reflect";

/** UI state persisted under the reserved "ui" key in data.json, beside the settings. */
export interface UiState {
	monthFilter?: string | null;
	tagFilter?: string | null;
	highlightFilter?: string | null;
	collapsedYears?: string[];
}

export interface RippleSettings {
	journalFolder: string;
	aiProviderId: string | null;
	reflectionPrompt: string;
}

export const DEFAULT_REFLECTION_PROMPT =
	"You are a thoughtful companion reading a private journal. Reply to the entry in a few short sentences: notice what matters, ask at most one question, and never flatter or moralise.";

export const DEFAULT_SETTINGS: RippleSettings = {
	journalFolder: "Ripple",
	aiProviderId: null,
	reflectionPrompt: DEFAULT_REFLECTION_PROMPT,
};

export class RippleSettingTab extends PluginSettingTab {
	private aiState: "looking" | "absent" | IAIProvider[] = "looking";
	private probeStarted = false;

	constructor(
		app: App,
		private readonly plugin: RipplePlugin,
	) {
		super(app, plugin);
	}

	// Debounced: applying per keystroke would point a live store at every
	// half-typed path.
	private readonly applyFolder = debounce(
		(value: string) =>
			void this.plugin.setJournalFolder(value.trim() || DEFAULT_SETTINGS.journalFolder),
		600,
		true,
	);

	/** One probe per tab lifetime; both render paths re-render on completion. */
	private probeProviders(rerender: () => void): void {
		if (this.probeStarted) return;
		this.probeStarted = true;
		void getAI().then((ai) => {
			this.aiState = ai ? ai.providers : "absent";
			rerender();
		});
	}

	private aiDesc(): string {
		if (this.aiState === "absent") {
			return "Install and configure the AI Providers plugin to enable reflections.";
		}
		if (this.aiState === "looking") return "Looking for the AI Providers plugin…";
		return "Reflections stream from this provider; keys stay with AI Providers.";
	}

	private providerOptions(): Record<string, string> {
		const options: Record<string, string> = { "": "None" };
		if (Array.isArray(this.aiState)) {
			for (const p of this.aiState) {
				options[p.id] = p.model ? `${p.name} (${p.model})` : p.name;
			}
		}
		return options;
	}

	/** Declarative settings (Obsidian 1.13+): rendering and settings search. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		// display() re-renders on either API version, so the probe re-render
		// never touches 1.13-only members.
		this.probeProviders(() => this.display());
		return [
			{
				name: "Journal folder",
				desc: "Posts live here and nowhere else; the rest of the vault is untouched.",
				control: {
					type: "folder",
					key: "journalFolder",
					defaultValue: DEFAULT_SETTINGS.journalFolder,
					placeholder: DEFAULT_SETTINGS.journalFolder,
				},
			},
			{
				name: "AI provider",
				desc: this.aiDesc(),
				control: {
					type: "dropdown",
					key: "aiProviderId",
					options: this.providerOptions(),
					disabled: () => !Array.isArray(this.aiState),
				},
			},
			{
				name: "Reflection prompt",
				desc: "How the AI should read and reply to an entry.",
				control: {
					type: "textarea",
					key: "reflectionPrompt",
					rows: 4,
					defaultValue: DEFAULT_REFLECTION_PROMPT,
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key === "aiProviderId") return this.plugin.settings.aiProviderId ?? "";
		return this.plugin.settings[key as keyof RippleSettings];
	}

	setControlValue(key: string, value: unknown): void | Promise<void> {
		const text = typeof value === "string" ? value : "";
		if (key === "journalFolder") {
			this.applyFolder(text);
			return;
		}
		if (key === "aiProviderId") {
			this.plugin.settings.aiProviderId = text || null;
		} else if (key === "reflectionPrompt") {
			this.plugin.settings.reflectionPrompt = text.trim() || DEFAULT_REFLECTION_PROMPT;
		}
		return this.plugin.saveSettings();
	}

	/** Imperative fallback, per the API guidance: the declarative renderer
	 * does not exist before 1.13.0 and minAppVersion is 1.12.7. The
	 * deprecation is allowed in eslint.config.mjs for the same reason. */
	display(): void {
		if (requireApiVersion("1.13.0")) {
			// 1.13 renders getSettingDefinitions itself.
			super.display();
			return;
		}
		this.probeProviders(() => this.display());
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Journal folder")
			.setDesc("Posts live here and nowhere else; the rest of the vault is untouched.")
			.addText((text) =>
				text.setValue(this.plugin.settings.journalFolder).onChange(this.applyFolder),
			)
			.addExtraButton((button) =>
				button
					.setIcon("folder-open")
					.setTooltip("Choose an existing folder")
					.onClick(() => {
						new FolderPicker(this.app, (folder) => {
							void this.plugin.setJournalFolder(folder.path);
							this.display();
						}).open();
					}),
			);

		const provider = new Setting(containerEl).setName("AI provider").setDesc(this.aiDesc());
		if (Array.isArray(this.aiState)) {
			const providers = this.aiState;
			provider.addDropdown((dropdown) => {
				dropdown.addOption("", "None");
				for (const p of providers) {
					dropdown.addOption(p.id, p.model ? `${p.name} (${p.model})` : p.name);
				}
				const current = this.plugin.settings.aiProviderId;
				dropdown.setValue(
					current && providers.some((p) => p.id === current) ? current : "",
				);
				dropdown.onChange(async (value) => {
					this.plugin.settings.aiProviderId = value || null;
					await this.plugin.saveSettings();
				});
			});
		}

		new Setting(containerEl)
			.setName("Reflection prompt")
			.setDesc("How the AI should read and reply to an entry.")
			.addTextArea((text) =>
				text.setValue(this.plugin.settings.reflectionPrompt).onChange(async (value) => {
					this.plugin.settings.reflectionPrompt =
						value.trim() || DEFAULT_REFLECTION_PROMPT;
					await this.plugin.saveSettings();
				}),
			);
	}
}
