import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { useDocumentTitle } from "../lib/document-title";
import { frontendModules } from "../modules/registry";

function Titled({ title }: { title?: string }) {
  useDocumentTitle(title);
  return null;
}

afterEach(() => {
  document.head.querySelectorAll('meta[name="robots"]').forEach((meta) => meta.remove());
  window.history.pushState({}, "", "/");
});

describe("document title", () => {
  it("names the tab after the page", () => {
    const { rerender } = render(<Titled title="Clientes" />);
    expect(document.title).toBe("Clientes · Argos Suite");
    rerender(<Titled title="Animales" />);
    expect(document.title).toBe("Animales · Argos Suite");
    rerender(<Titled />);
    expect(document.title).toBe("Argos Suite");
  });

  it("is declared by every route", () => {
    for (const route of frontendModules.flatMap((module) => module.routes)) {
      expect(route.title.trim(), route.path).not.toBe("");
    }
  });
});

describe("indexing", () => {
  it("keeps the application out of search results", async () => {
    window.history.pushState({}, "", "/login");
    render(<App />);
    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, nofollow",
      ),
    );
    await waitFor(() => expect(document.title).toBe("Iniciar sesión · Argos Suite"));
  });
});
