import { createElement, type ComponentProps } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfficeCharacter } from "@/components/office/office-character";

const defaults = {
  seed: "fictional-companion-1",
  name: "Test Companion",
  roleTitle: "AI Operations Coordinator",
  departmentSlug: "operations",
};

function render(overrides: Partial<ComponentProps<typeof OfficeCharacter>> = {}) {
  return renderToStaticMarkup(createElement(OfficeCharacter, { ...defaults, ...overrides }));
}

describe("office character", () => {
  const cast = [
    { kind: "operations", roleTitle: "AI Operations Coordinator", departmentSlug: "operations", prop: 'x="15" y="71"' },
    { kind: "library", roleTitle: "AI Knowledge Assistant", departmentSlug: "operations", prop: 'x="93" y="85"' },
    { kind: "sales", roleTitle: "AI Sales Support Specialist", departmentSlug: "sales", prop: "M92 52q0 9-18 9" },
    { kind: "marketing", roleTitle: "AI Marketing Content Assistant", departmentSlug: "marketing", prop: 'x="97" y="73"' },
    { kind: "creative", roleTitle: "AI Creative Production Assistant", departmentSlug: "creative", prop: 'rotate(-9 64 25)' },
    { kind: "developer", roleTitle: "AI Delivery Coordinator", departmentSlug: "development", prop: 'x="47" y="39"' },
    { kind: "support", roleTitle: "AI Client Support Specialist", departmentSlug: "support", prop: "M97 84q2-3 3 0" },
  ];

  it.each(cast)("renders the $kind role with its distinctive accessory", ({ kind, roleTitle, departmentSlug, prop }) => {
    const markup = render({ roleTitle, departmentSlug });
    expect(markup).toContain(`data-character="${kind}"`);
    expect(markup).toContain(prop);
    expect(markup).toContain('data-motion="none"');
  });

  it("produces seven distinct station designs without relying on employee names", () => {
    const designs = cast.map(({ roleTitle, departmentSlug }) => render({ roleTitle, departmentSlug }));
    expect(new Set(designs).size).toBe(7);
    expect(render({ name: "Another Name" })).toBe(render());
  });

  it("defaults to a static decorative SVG without competing accessible labels or tab stops", () => {
    const markup = render();
    expect(markup).toMatch(/^<svg /);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
    expect(markup).toContain('data-motion="none"');
    expect(markup).not.toMatch(/aria-label=|tabindex=|<title|<button|<a /);
    expect(markup).not.toContain(defaults.name);
    expect(markup).toContain('viewBox="0 0 128 132"');
    expect(markup).toContain('width="112" height="115.5"');
  });

  it.each(["typing", "reviewing", "waiting", "none"] as const)("accepts explicit %s motion", (motion) => {
    expect(render({ motion })).toContain(`data-motion="${motion}"`);
  });

  it("uses a book for review without replacing the employee role", () => {
    const markup = render({ roleTitle: "AI Sales Support Specialist", departmentSlug: "sales", motion: "reviewing" });
    expect(markup).toContain('data-character="sales"');
    expect(markup).toContain("M43 77q10-3 21 2");
    expect(markup).not.toContain('x="45" y="75"');
  });

  it("is deterministic across renders and varies its silhouette by seed", () => {
    expect(render()).toBe(render());
    const variants = new Set(Array.from({ length: 12 }, (_, i) => render({ seed: `companion-${i}` })));
    expect(variants.size).toBeGreaterThan(1);
    expect(render({ seed: "", name: "Fallback" })).toBe(render({ seed: "Fallback", name: "Other" }));
  });

  it("keeps the viewBox and proportional height at spotlight size", () => {
    expect(render({ size: 148 })).toContain('width="148" height="152.625"');
    expect(render({ size: 148 })).toContain('viewBox="0 0 128 132"');
  });

  it("gates every animation behind no-preference and an explicit non-none motion", () => {
    const css = readFileSync(new URL("../src/components/office/office-character.module.css", import.meta.url), "utf8");
    const gate = "@media (prefers-reduced-motion: no-preference)";
    const start = css.indexOf(gate);
    expect(start).toBeGreaterThan(-1);
    const opening = css.indexOf("{", start);
    let depth = 1;
    let end = opening + 1;
    while (depth > 0 && end < css.length) {
      if (css[end] === "{") depth++;
      if (css[end] === "}") depth--;
      end++;
    }
    expect(depth).toBe(0);
    const gated = css.slice(opening + 1, end - 1);
    const outside = css.slice(0, start) + css.slice(end);
    expect(outside).not.toMatch(/\banimation(?:-[\w-]+)?\s*:/);
    const rules = [...gated.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
      .filter((match) => /\banimation(?:-[\w-]+)?\s*:/.test(match[2]));
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector] of rules) {
      expect(selector.trim()).toMatch(/^\.character(?:\[data-motion="(?:typing|reviewing|waiting)"\]|:not\(\[data-motion="none"\]\))/);
    }
  });
});
