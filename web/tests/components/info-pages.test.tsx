import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import AboutPage from "@/app/about/page";
import ContactPage from "@/app/contact/page";
import PrivacyPage from "@/app/privacy/page";
import { Footer } from "@/components/Footer";
import { getContactEmail, ISSUES_URL } from "@/lib/contact";

const env = (values: Record<string, string | undefined>) => values as NodeJS.ProcessEnv;

describe("getContactEmail", () => {
  it("has no default", () => {
    expect(getContactEmail(env({}))).toBeNull();
    expect(getContactEmail(env({ NEXT_PUBLIC_CONTACT_EMAIL: "  " }))).toBeNull();
  });

  it("accepts a plain address and rejects anything else", () => {
    expect(getContactEmail(env({ NEXT_PUBLIC_CONTACT_EMAIL: " hello@blindcard.example " }))).toBe(
      "hello@blindcard.example",
    );
    for (const bad of ["not-an-address", "a@b", "a b@c.d", "a@b.c, d@e.f", "<a@b.c>", "javascript:alert(1)//@x.y"]) {
      expect(getContactEmail(env({ NEXT_PUBLIC_CONTACT_EMAIL: bad }))).toBeNull();
    }
  });
});

describe("the footer", () => {
  it("links the three info pages and keeps the exact disclaimer", () => {
    const html = renderToStaticMarkup(<Footer />);
    for (const href of ["/about", "/privacy", "/contact"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Unofficial fan project, not affiliated with any promotion.");
  });
});

describe("the contact page", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("points to the public issue tracker when no address is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "");
    const html = renderToStaticMarkup(<ContactPage />);
    expect(html).toContain(ISSUES_URL);
    expect(html).not.toContain("mailto:");
  });

  it("shows the configured address, and only that one", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "hello@blindcard.example");
    const html = renderToStaticMarkup(<ContactPage />);
    expect(html).toContain('href="mailto:hello@blindcard.example"');
    expect(html).not.toContain(ISSUES_URL);
  });
});

describe("about and privacy", () => {
  it("never use the protected names (the mirror's repository name is a link, not branding)", () => {
    for (const page of [<AboutPage key="a" />, <PrivacyPage key="p" />, <ContactPage key="c" />]) {
      const html = renderToStaticMarkup(page);
      expect(html).not.toMatch(/\bUFC\b|Octagon/i);
    }
  });

  it("states the limits of the model lean and that it is not betting advice", () => {
    const html = renderToStaticMarkup(<AboutPage />);
    expect(html).toContain("not betting advice");
    expect(html).toContain("CC BY-SA 4.0");
  });
});
