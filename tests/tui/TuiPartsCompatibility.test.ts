import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { ButtonRenderable } from "@tuiparts/core/button";
import {
  CollapsiblePanelRenderable,
  CollapsibleRootRenderable,
  CollapsibleTriggerRenderable,
} from "@tuiparts/core/collapsible";
import {
  DialogBackdropRenderable,
  DialogCloseRenderable,
  DialogPopupRenderable,
  DialogPortalRenderable,
  DialogRootRenderable,
} from "@tuiparts/core/dialog";
import { InputRenderable } from "@tuiparts/core/input";
import {
  RadioIndicatorRenderable,
  RadioRootRenderable,
} from "@tuiparts/core/radio";
import { RadioGroupRenderable } from "@tuiparts/core/radio-group";

describe("TUI Parts compatibility with OpenTUI 0.5", () => {
  let renderer: CliRenderer | undefined;

  afterEach(() => renderer?.destroy());

  test("Dialog renders and contains focus but fails Escape on OpenTUI 0.5", async () => {
    const setup = await createTestRenderer({ width: 60, height: 20 });
    renderer = setup.renderer;
    const before = new ButtonRenderable(renderer, { id: "before" });
    before.add(new TextRenderable(renderer, { content: "Before" }));
    renderer.root.add(before);
    before.focus();

    const root = new DialogRootRenderable(renderer, { id: "dialog-root" });
    const portal = new DialogPortalRenderable(renderer, {
      id: "dialog-portal",
      store: root.store,
    });
    const backdrop = new DialogBackdropRenderable(renderer, {
      id: "dialog-backdrop",
      store: root.store,
    });
    const popup = new DialogPopupRenderable(renderer, {
      id: "dialog-popup",
      store: root.store,
    });
    const first = new ButtonRenderable(renderer, { id: "dialog-first" });
    const close = new DialogCloseRenderable(renderer, {
      id: "dialog-close",
      store: root.store,
    });
    first.add(new TextRenderable(renderer, { content: "First" }));
    close.add(new TextRenderable(renderer, { content: "Close" }));
    popup.add(first);
    popup.add(close);
    popup.registerFocusable(first, true);
    popup.registerFocusable(close);
    portal.add(backdrop);
    portal.add(popup);
    root.add(portal);
    renderer.root.add(root);

    root.open = true;
    await setup.flush();
    expect(root.state.open).toBe(true);
    expect(renderer.currentFocusedRenderable?.id).toBe("dialog-first");
    setup.mockInput.pressTab();
    await setup.flush();
    expect(renderer.currentFocusedRenderable?.id).toBe("dialog-close");
    setup.mockInput.pressTab();
    await setup.flush();
    expect(renderer.currentFocusedRenderable?.id).toBe("dialog-first");
    setup.mockInput.pressEscape();
    await setup.flush();
    expect(root.state.open).toBe(true);
    expect(renderer.currentFocusedRenderable?.id).toBe("dialog-first");
  });

  test("Collapsible supports controlled state", async () => {
    const setup = await createTestRenderer({ width: 40, height: 12 });
    renderer = setup.renderer;
    let open = false;
    const root = new CollapsibleRootRenderable(renderer, {
      open,
      onOpenChange: (next) => {
        open = next;
        root.open = next;
      },
    });
    const trigger = new CollapsibleTriggerRenderable(renderer, {
      id: "collapsible-trigger",
      store: root.store,
    });
    const panel = new CollapsiblePanelRenderable(renderer, {
      id: "collapsible-panel",
      store: root.store,
    });
    trigger.add(new TextRenderable(renderer, { content: "Details" }));
    panel.add(new TextRenderable(renderer, { content: "Metadata" }));
    root.add(trigger);
    root.add(panel);
    renderer.root.add(root);
    trigger.focus();
    setup.mockInput.pressEnter();
    await setup.flush();
    expect(open).toBe(true);
    expect(panel.visible).toBe(true);
  });

  test("Input submits", async () => {
    const setup = await createTestRenderer({ width: 40, height: 8 });
    renderer = setup.renderer;
    let submitted = "";
    const input = new InputRenderable(renderer, {
      id: "input",
      onSubmit: (value) => (submitted = value),
    });
    renderer.root.add(input);
    input.focus();
    await setup.mockInput.typeText("note");
    setup.mockInput.pressEnter();
    await setup.flush();
    expect(submitted).toBe("note");
  });

  test("Button activates", async () => {
    const setup = await createTestRenderer({ width: 40, height: 8 });
    renderer = setup.renderer;
    let presses = 0;
    const button = new ButtonRenderable(renderer, {
      id: "button",
      onPress: () => presses++,
    });
    button.add(new TextRenderable(renderer, { content: "Apply" }));
    renderer.root.add(button);
    button.focus();
    setup.mockInput.pressEnter();
    await setup.flush();
    expect(presses).toBe(1);
  });

  test("Radio and RadioGroup render but fail navigation on OpenTUI 0.5", async () => {
    const setup = await createTestRenderer({ width: 40, height: 8 });
    renderer = setup.renderer;
    let selected = "one";
    const group = new RadioGroupRenderable(renderer, {
      id: "group",
      value: selected,
      onValueChange: (value) => {
        selected = value;
        group.value = value;
      },
    });
    for (const value of ["one", "two"]) {
      const radio = new RadioRootRenderable(renderer, {
        id: `radio-${value}`,
        store: group.store,
        value,
      });
      const indicator = new RadioIndicatorRenderable(renderer, { radio });
      indicator.add(new BoxRenderable(renderer, { width: 1, height: 1 }));
      radio.add(indicator);
      radio.add(new TextRenderable(renderer, { content: value }));
      group.add(radio);
    }
    renderer.root.add(group);
    const first = renderer.root.getRenderable("radio-one");
    first?.focus();
    setup.mockInput.pressArrow("down");
    await setup.flush();
    expect(selected).toBe("one");
    expect(renderer.currentFocusedRenderable).toBeNull();
  });
});
