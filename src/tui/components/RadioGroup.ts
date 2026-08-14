import {
  BoxRenderable,
  TextRenderable,
  bold,
  fg,
  t,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import type { Theme } from "../../theme.js";

export interface RadioChoice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly color?: string;
}

export interface RadioGroupOptions<T extends string> {
  readonly id: string;
  readonly theme: Theme;
  readonly choices: readonly RadioChoice<T>[];
  readonly value: T;
  readonly onValueChange?: (value: T) => void;
  readonly onActivate?: (value: T) => void;
}

/** Native OpenTUI fallback for TUI Parts radio navigation on OpenTUI 0.5. */
export class RadioGroup<T extends string> extends BoxRenderable {
  private readonly theme: Theme;
  private readonly choices: readonly RadioChoice<T>[];
  private readonly rows: TextRenderable[];
  private readonly onValueChange?: (value: T) => void;
  private readonly onActivate?: (value: T) => void;
  private selectedIndex: number;

  constructor(renderer: CliRenderer, options: RadioGroupOptions<T>) {
    super(renderer, {
      id: options.id,
      flexDirection: "column",
      width: "100%",
      height: options.choices.length * 2,
      flexShrink: 0,
      focusable: true,
    });
    this.theme = options.theme;
    this.choices = options.choices;
    this.onValueChange = options.onValueChange;
    this.onActivate = options.onActivate;
    this.selectedIndex = Math.max(
      0,
      options.choices.findIndex((choice) => choice.value === options.value),
    );
    this.rows = options.choices.map((choice, index) => {
      const row = new TextRenderable(renderer, {
        id: `${options.id}-${choice.value}`,
        height: 2,
        flexShrink: 0,
        wrapMode: "none",
        truncate: true,
        onMouseDown: (event) => {
          if (event.button !== 0) return;
          this.select(index);
          this.focus();
        },
      });
      this.add(row);
      return row;
    });
    this.refresh();
  }

  get value(): T {
    return this.choices[this.selectedIndex]!.value;
  }

  set value(value: T) {
    const index = this.choices.findIndex((choice) => choice.value === value);
    if (index >= 0) this.select(index, false);
  }

  override handleKeyPress(key: KeyEvent): boolean {
    if (key.name === "up" || key.name === "left") {
      this.select(
        (this.selectedIndex - 1 + this.choices.length) % this.choices.length,
      );
      return true;
    }
    if (key.name === "down" || key.name === "right") {
      this.select((this.selectedIndex + 1) % this.choices.length);
      return true;
    }
    if (key.name === "return" || key.name === "space") {
      this.onActivate?.(this.value);
      return true;
    }
    return false;
  }

  private select(index: number, emit = true): void {
    this.selectedIndex = index;
    this.refresh();
    if (emit) this.onValueChange?.(this.value);
  }

  private refresh(): void {
    this.rows.forEach((row, index) => {
      const choice = this.choices[index]!;
      const selected = index === this.selectedIndex;
      const marker = selected ? "●" : "○";
      row.content = t`${bold(fg(selected ? (choice.color ?? this.theme.accent) : this.theme.fgMuted)(`${marker} ${choice.label}`))}\n${fg(this.theme.fgSubtle)(`  ${choice.description ?? ""}`)}`;
    });
  }
}
