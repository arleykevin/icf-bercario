import { describe, it, expect } from "vitest";
import { APP_ROLES, ROLE_LABELS, isAppRole } from "./roles";

describe("papéis (RBAC)", () => {
  it("todo papel tem um rótulo legível", () => {
    for (const role of APP_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it("isAppRole valida corretamente", () => {
    expect(isAppRole("admin")).toBe(true);
    expect(isAppRole("teacher")).toBe(true);
    expect(isAppRole("pai")).toBe(false); // papel legado do doc original — não existe mais
    expect(isAppRole(null)).toBe(false);
  });
});
