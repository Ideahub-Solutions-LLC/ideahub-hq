import { createElement, type ComponentProps } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfficeActor, OfficeDesk } from "@/components/office/office-character";

const defaults: ComponentProps<typeof OfficeActor> = {
  seed: "fictional-actor", name: "Test Actor", roleTitle: "Operations Coordinator", departmentSlug: "operations",
  posture: "walking", motion: "none", facing: "right",
};
const render = (overrides: Partial<ComponentProps<typeof OfficeActor>> = {}) => renderToStaticMarkup(createElement(OfficeActor, { ...defaults, ...overrides }));

describe("office actors and independent furniture", () => {
  it("renders person-only walking with independently articulated limbs", () => {
    const html = render();
    expect(html).toContain('viewBox="0 0 128 160"');
    expect(html).toContain('width="90" height="112.5"');
    expect(html).toContain('data-posture="walking"');
    for (const limb of ["left-leg", "right-leg", "left-arm", "right-arm"]) expect(html).toContain(`data-body-part="${limb}"`);
    expect(html).not.toMatch(/data-furniture|M16 99h96|M43 92 40 74|M95 81h10/);
  });

  it.each(["operations", "library", "sales", "marketing", "creative", "developer", "support"])("preserves the %s identity across every posture", (kind) => {
    const heads = ["walking", "standing", "sitting"].map((posture) => {
      const html = render({ posture: posture as ComponentProps<typeof OfficeActor>["posture"], roleTitle: kind, departmentSlug: kind });
      expect(html).toContain(`data-character="${kind}"`);
      return html.split('data-identity="head">')[1].split('data-body-part="left-arm"')[0];
    });
    expect(new Set(heads).size).toBe(1);
  });

  it("keeps seed identity and explicit motion, direction, and pause controls", () => {
    expect(render({ name: "Different" })).toBe(render());
    const html = render({ posture: "sitting", motion: "typing", facing: "left", paused: true });
    for (const attribute of ['data-posture="sitting"', 'data-motion="typing"', 'data-facing="left"', 'data-paused="true"', 'aria-hidden="true"', 'focusable="false"']) expect(html).toContain(attribute);
    expect(html).not.toMatch(/aria-label=|tabindex=|<title|<button/);
  });

  it("renders a static desk, laptop and low chair independently", () => {
    const html = renderToStaticMarkup(createElement(OfficeDesk, { departmentSlug: "sales" }));
    for (const item of ["desk", "chair", "laptop"]) expect(html).toContain(`data-furniture="${item}"`);
    expect(html).toContain('width="110" height="113.4375"');
    expect(html).not.toMatch(/data-posture|data-body-part|data-identity|data-motion/);
  });

  it("gates all animation and 400ms posture transitions by reduced motion and pause", () => {
    const css = readFileSync(new URL("../src/components/office/office-actor.module.css", import.meta.url), "utf8");
    const start = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    const open = css.indexOf("{", start);
    let end = open + 1, depth = 1;
    while (depth && end < css.length) { if (css[end] === "{") depth++; if (css[end] === "}") depth--; end++; }
    const gated = css.slice(open + 1, end - 1);
    expect(start).toBeGreaterThan(-1);
    expect(css.slice(0, start) + css.slice(end)).not.toMatch(/\b(animation|transition)(?:-[\w-]+)?\s*:/);
    const rules = [...gated.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
    for (const [, selectors, body] of rules) {
      if (/\b(animation|transition)\s*:/.test(body)) for (const selector of selectors.split(",")) expect(selector).toContain('[data-paused="false"]');
    }
    expect(gated).toContain("transition: transform 400ms");
    expect(gated).toContain("step-left");
    expect(gated).toContain("step-right");
  });
});
