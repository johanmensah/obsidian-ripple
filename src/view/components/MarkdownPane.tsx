import { Component, MarkdownRenderer } from "obsidian";
import { useEffect, useRef } from "react";
import { stripFrontmatter } from "../../services/post-io";
import { usePlugin } from "../context";

/** Obsidian-rendered post body; frontmatter stripped. StrictMode-safe. */
export function MarkdownPane({ path, mtime }: { path: string; mtime: number }) {
	const plugin = usePlugin();
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = ref.current;
		const file = plugin.app.vault.getFileByPath(path);
		if (!el || !file) return;
		el.empty();
		const component = new Component();
		component.load();
		void plugin.app.vault
			.cachedRead(file)
			.then((text) => MarkdownRenderer.render(plugin.app, stripFrontmatter(text), el, path, component));
		return () => {
			component.unload();
			el.empty();
		};
	}, [path, mtime, plugin]);
	return <div ref={ref} className="ripple-post-body markdown-rendered" />;
}
