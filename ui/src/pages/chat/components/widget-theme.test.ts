/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWidgetThemeMessage,
  collectWidgetThemeTokens,
  installWidgetThemeObserver,
  postWidgetTheme,
} from "./widget-theme.ts";

function stubComputedStyles(values: Record<string, string>) {
  vi.stubGlobal(
    "getComputedStyle",
    vi.fn(
      () =>
        ({
          getPropertyValue: (name: string) => values[name] ?? "",
        }) as CSSStyleDeclaration,
    ),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeMode;
});

describe("widget theme bridge", () => {
  it("maps host variables to widget tokens and drops empty values", () => {
    const hostValues: Record<string, string> = {
      "--bg": "  #101010  ",
      "--card": "#202020",
      "--text": "   ",
      "--accent-foreground": "#fff",
      "--mono": " ui-monospace ",
    };

    expect(collectWidgetThemeTokens((hostVar) => hostValues[hostVar] ?? "")).toEqual({
      surface: "#101010",
      card: "#202020",
      "accent-fg": "#fff",
      "font-mono": "ui-monospace",
    });
  });

  it("builds the current theme message", () => {
    document.documentElement.dataset.themeMode = "light";
    stubComputedStyles({ "--bg": "#faf9f7", "--accent": "#bd4531" });

    expect(buildWidgetThemeMessage()).toEqual({
      type: "openclaw:widget-theme",
      mode: "light",
      tokens: { surface: "#faf9f7", accent: "#bd4531" },
    });
  });

  it('posts the theme to the widget with target origin "*"', () => {
    document.documentElement.dataset.themeMode = "dark";
    stubComputedStyles({ "--bg": "#0e1015" });
    const postMessage = vi.fn();
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;

    postWidgetTheme(frame);

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "openclaw:widget-theme",
        mode: "dark",
        tokens: { surface: "#0e1015" },
      },
      "*",
    );
  });

  it("posts theme changes to connected frames and installs once", () => {
    class FakeMutationObserver {
      static instances: FakeMutationObserver[] = [];
      readonly observe = vi.fn();
      readonly disconnect = vi.fn();
      readonly takeRecords = vi.fn((): MutationRecord[] => []);

      constructor(readonly callback: MutationCallback) {
        FakeMutationObserver.instances.push(this);
      }

      trigger(record: MutationRecord): void {
        this.callback([record], this as unknown as MutationObserver);
      }
    }

    vi.stubGlobal("MutationObserver", FakeMutationObserver);
    stubComputedStyles({ "--accent": "#c41e30" });
    const connectedPost = vi.fn();
    const detachedPost = vi.fn();
    const connected = {
      isConnected: true,
      contentWindow: { postMessage: connectedPost },
    } as unknown as HTMLIFrameElement;
    const detached = {
      isConnected: false,
      contentWindow: { postMessage: detachedPost },
    } as unknown as HTMLIFrameElement;
    const getFrames = () => [connected, detached];

    installWidgetThemeObserver(getFrames);
    installWidgetThemeObserver(getFrames);

    expect(FakeMutationObserver.instances).toHaveLength(1);
    expect(FakeMutationObserver.instances[0]?.observe).toHaveBeenCalledWith(
      document.documentElement,
      {
        attributes: true,
        attributeFilter: ["data-theme", "data-theme-mode"],
      },
    );
    FakeMutationObserver.instances[0]?.trigger({
      attributeName: "data-theme",
    } as MutationRecord);
    expect(connectedPost).toHaveBeenCalledOnce();
    expect(detachedPost).not.toHaveBeenCalled();
  });
});
