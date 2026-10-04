import { describe, expect, it } from "vitest";
import { initials } from "@/lib/card/initials";

describe("initials", () => {
  it.each([
    ["Arman Tsarukyan", "AT"],
    ["Raul Rosas Jr.", "RR"],
    ["Jan Błachowicz", "JB"],
    ["Alexandre Pantoja", "AP"],
    ["Cris Cyborg", "CC"],
    ["Rongzhu", "R"],
    ["  Joel   Alvarez  ", "JA"],
    ["Sean O'Malley", "SO"],
    ["Ünal Öztürk", "ÜÖ"],
    ["\"The Beast\" Jones", "TJ"],
    ["", "?"],
    ["   ", "?"],
    ["Jr.", "?"],
  ])("%s -> %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
