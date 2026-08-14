import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  fg,
  t,
  type CliRenderer,
  type ScrollBoxOptions,
} from "@opentui/core";
import type { Theme } from "../../theme.js";

export interface ScrollSurfaceOptions extends ScrollBoxOptions {
  readonly theme: Theme;
}

/** Scroll surface with a fixed informational gutter and no native scrollbar. */
export class ScrollSurface extends BoxRenderable {
  readonly scrollBox: ScrollBoxRenderable;
  private readonly marker: TextRenderable;
  private readonly theme: Theme;
  private markerText = "";
  private markerMetrics = "";

  constructor(
    renderer: CliRenderer,
    { theme, ...options }: ScrollSurfaceOptions,
  ) {
    super(renderer, {
      id: options.id,
      flexDirection: "row",
      width: options.width ?? "100%",
      height: options.height,
      flexGrow: options.flexGrow,
      flexShrink: options.flexShrink,
      minHeight: options.minHeight,
      backgroundColor: options.backgroundColor,
      focusable: options.focusable,
    });
    this.theme = theme;
    this.scrollBox = new ScrollBoxRenderable(renderer, {
      ...options,
      id: `${options.id}-scrollbox`,
      width: undefined,
      flexGrow: 1,
      minWidth: 0,
    });
    const syncAfterRender = () => this.syncMarker();
    this.scrollBox.renderAfter = syncAfterRender;
    this.scrollBox.verticalScrollBar.visible = false;
    this.marker = new TextRenderable(renderer, {
      id: `${options.id}-marker`,
      width: 1,
      height: "100%",
      flexShrink: 0,
      content: "",
      wrapMode: "none",
    });
    this.add(this.scrollBox);
    this.add(this.marker);
  }

  addContent(renderable: Parameters<ScrollBoxRenderable["add"]>[0]): number {
    return this.scrollBox.add(renderable);
  }

  focus(): void {
    this.scrollBox.focus();
  }

  blur(): void {
    this.scrollBox.blur();
  }

  override handleKeyPress(
    key: Parameters<ScrollBoxRenderable["handleKeyPress"]>[0],
  ): boolean {
    const handled = this.scrollBox.handleKeyPress(key);
    this.syncMarker();
    return handled;
  }

  syncMarker(): void {
    const viewport = this.scrollBox.viewport.height;
    if (viewport <= 0) return;
    const extent = Math.max(0, this.scrollBox.scrollHeight - viewport);
    const offset = Math.max(0, Math.min(this.scrollBox.scrollTop, extent));
    const metrics = `${viewport}:${extent}:${offset}`;
    if (metrics === this.markerMetrics) return;
    this.markerMetrics = metrics;
    const marker = renderMarker(viewport, extent, offset);
    if (marker === this.markerText) return;
    this.markerText = marker;
    this.marker.content = t`${fg(this.theme.fgSubtle)(marker)}`;
  }

  protected override onUpdate(deltaTime: number): void {
    super.onUpdate(deltaTime);
    if (this.markerMetrics) this.syncMarker();
  }
}

function renderMarker(
  viewport: number,
  extent: number,
  offset: number,
): string {
  if (viewport <= 0) return "";
  if (extent === 0) return " ".repeat(viewport).split("").join("\n");
  const thumb = Math.max(
    1,
    Math.floor((viewport * viewport) / (viewport + extent)),
  );
  const start = Math.round((offset / extent) * Math.max(0, viewport - thumb));
  return Array.from({ length: viewport }, (_, row) =>
    row >= start && row < start + thumb ? "┃" : "│",
  ).join("\n");
}
