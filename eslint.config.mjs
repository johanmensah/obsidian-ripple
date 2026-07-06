import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	{ ignores: ["main.js", "node_modules/**", "dev-vault/**", "*.mjs"] },
	...tseslint.configs.recommended,
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// Proper nouns the sentence-case rule cannot know: the AI Providers
			// plugin and Ripple itself.
			"obsidianmd/ui/sentence-case": [
				"warn",
				{ ignoreWords: ["Providers", "Ripple", "Ripple's"] },
			],
			// SettingTab.display is deprecated on 1.13 but is the only renderer
			// below it; the tab implements getSettingDefinitions and keeps
			// display as the documented pre-1.13 fallback.
			"@typescript-eslint/no-deprecated": [
				"warn",
				{
					allow: [
						{ from: "package", package: "obsidian", name: "display" },
						{ from: "file", name: "display", path: "src/settings.ts" },
					],
				},
			],
		},
	},
);
