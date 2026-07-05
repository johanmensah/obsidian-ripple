import { Component, MarkdownRenderer } from "obsidian";
import { useEffect, useRef } from "react";
import { splitFrontmatter } from "../../services/post-io";
import { usePlugin } from "../context";

/**
 * Obsidian-rendered post body; frontmatter stripped. The alive flag drops
 * reads that resolve after cleanup — StrictMode's double mount and rapid
 * mtime changes would otherwise append the body twice.
 */
export function MarkdownPane({ path, mtime }: { path: string; mtime: number }) {
	const plugin = usePlugin();
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = ref.current;
		const file = plugin.app.vault.getFileByPath(path);
		if (!el || !file) return;
		const component = new Component();
		component.load();
		let alive = true;
		void plugin.app.vault.cachedRead(file).then((text) => {
			if (!alive) return;
			el.empty();
			const { body } = splitFrontmatter(plugin.app, file, text);
			return MarkdownRenderer.render(plugin.app, body, el, path, component);
		});
		return () => {
			alive = false;
			component.unload();
			el.empty();
		};
	}, [path, mtime, plugin]);
	return <div ref={ref} className="ripple-post-body markdown-rendered" />;
}
