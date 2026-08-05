import type { IAIProvider } from "@obsidian-ai-providers/sdk";
import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	debounce,
	requireApiVersion,
} from "obsidian";
import type RipplePlugin from "./main";
import { FolderPicker } from "./modals/FolderPicker";
import {
	DEFAULT_EXPORT_FILENAME_DATE_TIME_FORMAT,
	DEFAULT_EXPORT_FILENAME_TEMPLATE,
	DEFAULT_EXPORT_LINE_TEMPLATE,
	DEFAULT_EXPORT_NOTE_DATE_FORMAT,
	DEFAULT_EXPORT_NOTE_TIME_FORMAT,
	DEFAULT_EXPORT_REFLECTION_NAME,
	DEFAULT_EXPORT_USER_NAME,
} from "./services/post-io";
import { getAI, waitForAIReady } from "./services/reflect";

/** UI state persisted under the reserved "ui" key in data.json, beside the settings. */
export interface UiState {
	monthFilter?: string | null;
	tagFilter?: string | null;
	highlightFilter?: string | null;
	collapsedYears?: string[];
}

export interface RippleSettings {
	journalFolder: string;
	exportFilenameTemplate: string;
	exportFilenameDateTimeFormat: string;
	exportPromptForName: boolean;
	exportUserName: string;
	exportReflectionName: string;
	exportLineTemplate: string;
	exportNoteDateFormat: string;
	exportNoteTimeFormat: string;
	aiProviderId: string | null;
	reflectionPrompt: string;
}

export const DEFAULT_REFLECTION_PROMPT =
	"You are a thoughtful companion reading a private journal. Respond to the supplied note or thread in a few short sentences: notice what matters, ask at most one question, and never flatter or moralise.";

export const DEFAULT_SETTINGS: RippleSettings = {
	journalFolder: "Ripple",
	exportFilenameTemplate: DEFAULT_EXPORT_FILENAME_TEMPLATE,
	exportFilenameDateTimeFormat: DEFAULT_EXPORT_FILENAME_DATE_TIME_FORMAT,
	exportPromptForName: false,
	exportUserName: DEFAULT_EXPORT_USER_NAME,
	exportReflectionName: DEFAULT_EXPORT_REFLECTION_NAME,
	exportLineTemplate: DEFAULT_EXPORT_LINE_TEMPLATE,
	exportNoteDateFormat: DEFAULT_EXPORT_NOTE_DATE_FORMAT,
	exportNoteTimeFormat: DEFAULT_EXPORT_NOTE_TIME_FORMAT,
	aiProviderId: null,
	reflectionPrompt: DEFAULT_REFLECTION_PROMPT,
};

export class RippleSettingTab extends PluginSettingTab {
	private aiState: "looking" | "absent" | IAIProvider[] = "looking";
	private probeInFlight = false;
	private readyWaitInFlight = false;
	private notifyAfterProbe = false;

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

	private setAIState(next: "absent" | IAIProvider[]): void {
		const currentKey = Array.isArray(this.aiState)
			? this.aiState.map(({ id, name, model }) => [id, name, model])
			: this.aiState;
		const nextKey = Array.isArray(next)
			? next.map(({ id, name, model }) => [id, name, model])
			: next;
		if (JSON.stringify(currentKey) === JSON.stringify(nextKey)) return;
		this.aiState = next;
		this.refreshSettings();
	}

	/** Refreshes providers on each render and keeps one late-readiness waiter. */
	private probeProviders(notify = false): void {
		if (notify) this.notifyAfterProbe = true;
		if (this.probeInFlight) return;
		this.probeInFlight = true;
		void getAI()
			.then((ai) => {
				if (!ai && !this.readyWaitInFlight) {
					this.readyWaitInFlight = true;
					void waitForAIReady()
						.then((ready) => this.setAIState(ready.providers))
						.catch((err: unknown) =>
							console.error("Ripple: AI Providers readiness failed", err),
						)
						.finally(() => {
							this.readyWaitInFlight = false;
						});
				}
				this.setAIState(ai ? ai.providers : "absent");
				if (!this.notifyAfterProbe) return;
				this.notifyAfterProbe = false;
				if (!ai) {
					new Notice("AI Providers is not available.");
				} else if (ai.providers.length === 0) {
					new Notice("No providers are configured in AI Providers.");
				} else {
					new Notice(
						ai.providers.length === 1
							? "Found 1 AI provider."
							: `Found ${ai.providers.length} AI providers.`,
					);
				}
			})
			.finally(() => {
				this.probeInFlight = false;
			});
	}

	private refreshProviders(): void {
		this.aiState = "looking";
		this.probeProviders(true);
		this.refreshSettings();
	}

	private refreshSettings(): void {
		if (requireApiVersion("1.13.0")) {
			this.update();
			return;
		}
		this.renderLegacySettings();
	}

	private restoreDefaults(): void {
		this.applyFolder.cancel();
		void this.plugin
			.restoreDefaultSettings()
			.then(() => {
				new Notice("Ripple settings restored to defaults.");
				this.refreshSettings();
			})
			.catch((err: unknown) => {
				console.error("Ripple: restore settings failed", err);
				new Notice("Could not restore Ripple settings.");
			});
	}

	private aiDesc(): string {
		if (this.aiState === "absent") {
			return "Install and configure the AI Providers plugin to enable reflections.";
		}
		if (this.aiState === "looking") return "Looking for the AI Providers plugin…";
		if (this.aiState.length === 0) return "No providers are configured in AI Providers.";
		return "Reflections stream from this provider; keys stay with AI Providers.";
	}

	private addProviderControls(setting: Setting): void {
		const providers = Array.isArray(this.aiState) ? this.aiState : [];
		setting.addDropdown((dropdown) => {
			dropdown.addOption("", "None");
			for (const provider of providers) {
				dropdown.addOption(
					provider.id,
					provider.model ? `${provider.name} (${provider.model})` : provider.name,
				);
			}
			const current = this.plugin.settings.aiProviderId;
			dropdown.setValue(
				current && providers.some((provider) => provider.id === current) ? current : "",
			);
			dropdown.setDisabled(!Array.isArray(this.aiState) || providers.length === 0);
			dropdown.onChange((value) => {
				void this.setControlValue("aiProviderId", value);
			});
		});
		setting.addButton((button) =>
			button
				.setButtonText("Refresh")
				.setTooltip("Refresh AI providers")
				.onClick(() => this.refreshProviders()),
		);
	}

	/** Declarative settings (Obsidian 1.13+): rendering and settings search. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		this.probeProviders();
		return [
			{
				name: "Journal folder",
				desc: "Posts live here.",
				control: {
					type: "folder",
					key: "journalFolder",
					defaultValue: DEFAULT_SETTINGS.journalFolder,
					placeholder: DEFAULT_SETTINGS.journalFolder,
				},
			},
			{
				type: "group",
				heading: "Thread export",
				items: [
					{
						name: "Filename template",
						desc: "Use {{datetime}}, {{root}}, and {{type}}. The default is the export date and time.",
						control: {
							type: "text",
							key: "exportFilenameTemplate",
							defaultValue: DEFAULT_EXPORT_FILENAME_TEMPLATE,
							placeholder: DEFAULT_EXPORT_FILENAME_TEMPLATE,
						},
					},
					{
						name: "Filename date and time format",
						desc: "Moment format used by {{datetime}} in export filenames.",
						render: (setting) => {
							setting.addMomentFormat((format) =>
								format
									.setDefaultFormat(DEFAULT_EXPORT_FILENAME_DATE_TIME_FORMAT)
									.setValue(this.plugin.settings.exportFilenameDateTimeFormat)
									.onChange((value) =>
										this.setControlValue("exportFilenameDateTimeFormat", value),
									),
							);
						},
					},
					{
						name: "Ask for an export name",
						desc: "Show the generated filename before exporting.",
						control: {
							type: "toggle",
							key: "exportPromptForName",
							defaultValue: false,
						},
					},
					{
						name: "User name",
						desc: "Speaker name used for journal notes and replies.",
						control: {
							type: "text",
							key: "exportUserName",
							defaultValue: DEFAULT_EXPORT_USER_NAME,
							placeholder: DEFAULT_EXPORT_USER_NAME,
						},
					},
					{
						name: "Reflection name",
						desc: "Speaker name used for AI reflections.",
						control: {
							type: "text",
							key: "exportReflectionName",
							defaultValue: DEFAULT_EXPORT_REFLECTION_NAME,
							placeholder: DEFAULT_EXPORT_REFLECTION_NAME,
						},
					},
					{
						name: "Transcript line template",
						desc: "Markdown template. Use {{date}}, {{time}}, {{speaker}}, and {{text}}.",
						control: {
							type: "text",
							key: "exportLineTemplate",
							defaultValue: DEFAULT_EXPORT_LINE_TEMPLATE,
							placeholder: DEFAULT_EXPORT_LINE_TEMPLATE,
						},
					},
					{
						name: "Note date format",
						desc: "Moment format used by {{date}} in transcript lines.",
						render: (setting) => {
							setting.addMomentFormat((format) =>
								format
									.setDefaultFormat(DEFAULT_EXPORT_NOTE_DATE_FORMAT)
									.setValue(this.plugin.settings.exportNoteDateFormat)
									.onChange((value) =>
										this.setControlValue("exportNoteDateFormat", value),
									),
							);
						},
					},
					{
						name: "Note time format",
						desc: "Moment format used by {{time}} in transcript lines.",
						render: (setting) => {
							setting.addMomentFormat((format) =>
								format
									.setDefaultFormat(DEFAULT_EXPORT_NOTE_TIME_FORMAT)
									.setValue(this.plugin.settings.exportNoteTimeFormat)
									.onChange((value) =>
										this.setControlValue("exportNoteTimeFormat", value),
									),
							);
						},
					},
				],
			},
			{
				name: "AI provider",
				desc: this.aiDesc(),
				render: (setting) => this.addProviderControls(setting),
			},
			{
				name: "Reflection prompt",
				desc: "How the AI should read and reply to a note or thread.",
				control: {
					type: "textarea",
					key: "reflectionPrompt",
					rows: 4,
					defaultValue: DEFAULT_REFLECTION_PROMPT,
				},
			},
			{
				name: "Restore defaults",
				desc: "Restore every Ripple setting except the journal folder.",
				render: (setting) => {
					setting.addButton((button) =>
						button
							.setButtonText("Restore")
							.onClick(() => this.restoreDefaults()),
					);
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key === "aiProviderId") return this.plugin.settings.aiProviderId ?? "";
		return this.plugin.settings[key as keyof RippleSettings];
	}

	setControlValue(key: string, value: unknown): void | Promise<void> {
		if (key === "exportPromptForName") {
			this.plugin.settings.exportPromptForName = value === true;
			return this.plugin.saveSettings();
		}
		const text = typeof value === "string" ? value : "";
		if (key === "journalFolder") {
			this.applyFolder(text);
			return;
		}
		if (key === "aiProviderId") {
			this.plugin.settings.aiProviderId = text || null;
		} else if (key === "reflectionPrompt") {
			this.plugin.settings.reflectionPrompt = text.trim() || DEFAULT_REFLECTION_PROMPT;
		} else if (key === "exportFilenameTemplate") {
			this.plugin.settings.exportFilenameTemplate =
				text.trim() || DEFAULT_EXPORT_FILENAME_TEMPLATE;
		} else if (key === "exportFilenameDateTimeFormat") {
			this.plugin.settings.exportFilenameDateTimeFormat =
				text.trim() || DEFAULT_EXPORT_FILENAME_DATE_TIME_FORMAT;
		} else if (key === "exportUserName") {
			this.plugin.settings.exportUserName = text.trim() || DEFAULT_EXPORT_USER_NAME;
		} else if (key === "exportReflectionName") {
			this.plugin.settings.exportReflectionName =
				text.trim() || DEFAULT_EXPORT_REFLECTION_NAME;
		} else if (key === "exportLineTemplate") {
			this.plugin.settings.exportLineTemplate =
				text.trim() || DEFAULT_EXPORT_LINE_TEMPLATE;
		} else if (key === "exportNoteDateFormat") {
			this.plugin.settings.exportNoteDateFormat =
				text.trim() || DEFAULT_EXPORT_NOTE_DATE_FORMAT;
		} else if (key === "exportNoteTimeFormat") {
			this.plugin.settings.exportNoteTimeFormat =
				text.trim() || DEFAULT_EXPORT_NOTE_TIME_FORMAT;
		}
		return this.plugin.saveSettings();
	}

	display(): void {
		this.renderLegacySettings();
	}

	/** Imperative fallback for Obsidian 1.12.7; 1.13+ renders the definitions above. */
	private renderLegacySettings(): void {
		this.probeProviders();
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Journal folder")
			.setDesc("Posts live here.")
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
							this.renderLegacySettings();
						}).open();
					}),
			);

		new Setting(containerEl).setName("Thread export").setHeading();

		new Setting(containerEl)
			.setName("Filename template")
			.setDesc(
				"Use {{datetime}}, {{root}}, and {{type}}. The default is the export date and time.",
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_EXPORT_FILENAME_TEMPLATE)
					.setValue(this.plugin.settings.exportFilenameTemplate)
					.onChange((value) =>
						this.setControlValue("exportFilenameTemplate", value),
					),
			);

		new Setting(containerEl)
			.setName("Filename date and time format")
			.setDesc("Moment format used by {{datetime}} in export filenames.")
			.addMomentFormat((format) =>
				format
					.setDefaultFormat(DEFAULT_EXPORT_FILENAME_DATE_TIME_FORMAT)
					.setValue(this.plugin.settings.exportFilenameDateTimeFormat)
					.onChange((value) =>
						this.setControlValue("exportFilenameDateTimeFormat", value),
					),
			);

		new Setting(containerEl)
			.setName("Ask for an export name")
			.setDesc("Show the generated filename before exporting.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.exportPromptForName)
					.onChange((value) => this.setControlValue("exportPromptForName", value)),
			);

		new Setting(containerEl)
			.setName("User name")
			.setDesc("Speaker name used for journal notes and replies.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_EXPORT_USER_NAME)
					.setValue(this.plugin.settings.exportUserName)
					.onChange((value) => this.setControlValue("exportUserName", value)),
			);

		new Setting(containerEl)
			.setName("Reflection name")
			.setDesc("Speaker name used for AI reflections.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_EXPORT_REFLECTION_NAME)
					.setValue(this.plugin.settings.exportReflectionName)
					.onChange((value) =>
						this.setControlValue("exportReflectionName", value),
					),
			);

		new Setting(containerEl)
			.setName("Transcript line template")
			.setDesc("Markdown template. Use {{date}}, {{time}}, {{speaker}}, and {{text}}.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_EXPORT_LINE_TEMPLATE)
					.setValue(this.plugin.settings.exportLineTemplate)
					.onChange((value) => this.setControlValue("exportLineTemplate", value)),
			);

		new Setting(containerEl)
			.setName("Note date format")
			.setDesc("Moment format used by {{date}} in transcript lines.")
			.addMomentFormat((format) =>
				format
					.setDefaultFormat(DEFAULT_EXPORT_NOTE_DATE_FORMAT)
					.setValue(this.plugin.settings.exportNoteDateFormat)
					.onChange((value) => this.setControlValue("exportNoteDateFormat", value)),
			);

		new Setting(containerEl)
			.setName("Note time format")
			.setDesc("Moment format used by {{time}} in transcript lines.")
			.addMomentFormat((format) =>
				format
					.setDefaultFormat(DEFAULT_EXPORT_NOTE_TIME_FORMAT)
					.setValue(this.plugin.settings.exportNoteTimeFormat)
					.onChange((value) => this.setControlValue("exportNoteTimeFormat", value)),
			);

		const provider = new Setting(containerEl).setName("AI provider").setDesc(this.aiDesc());
		this.addProviderControls(provider);

		new Setting(containerEl)
			.setName("Reflection prompt")
			.setDesc("How the AI should read and reply to a note or thread.")
			.addTextArea((text) =>
				text.setValue(this.plugin.settings.reflectionPrompt).onChange(async (value) => {
					this.plugin.settings.reflectionPrompt =
						value.trim() || DEFAULT_REFLECTION_PROMPT;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Restore defaults")
			.setDesc("Restore every Ripple setting except the journal folder.")
			.addButton((button) =>
				button
					.setButtonText("Restore")
					.onClick(() => this.restoreDefaults()),
			);
	}
}
