import { describe, expect, it } from "@jest/globals";
import {
  doctorSetupSchema,
  firstError,
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  notificationSettingsSchema,
  parseJson,
  registerSchema,
} from "@/lib/validation";

const patient = {
  isDoctor: false,
  agreed: true,
  email: "  jane@example.com ",
  password: "secret123",
  confirmPassword: "secret123",
  displayName: "",
  inviteCode: "",
};

describe("registerSchema", () => {
  it("accepts a valid patient and trims the email", () => {
    const r = registerSchema.safeParse(patient);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("jane@example.com");
  });

  it("requires agreeing to the terms first", () => {
    const r = registerSchema.safeParse({ ...patient, agreed: false });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstError(r.error)).toMatch(/Terms/);
  });

  it("enforces password rules and matching confirmation", () => {
    const short = registerSchema.safeParse({ ...patient, password: "a1", confirmPassword: "a1" });
    expect(short.success).toBe(false);
    const noDigit = registerSchema.safeParse({
      ...patient,
      password: "abcdefgh",
      confirmPassword: "abcdefgh",
    });
    expect(noDigit.success).toBe(false);
    const mismatch = registerSchema.safeParse({ ...patient, confirmPassword: "secret124" });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(firstError(mismatch.error)).toBe("Passwords do not match");
  });

  it("normalizes doctor name and invite code", () => {
    const r = registerSchema.safeParse({
      ...patient,
      isDoctor: true,
      displayName: "dr. Jane Cruz ",
      inviteCode: " abc123 ",
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.isDoctor) {
      expect(r.data.displayName).toBe("Dr. Jane Cruz");
      expect(r.data.inviteCode).toBe("ABC123");
    }
  });

  it("requires doctor name and invite code", () => {
    const base = { ...patient, isDoctor: true };
    expect(
      registerSchema.safeParse({ ...base, displayName: "Dr. ", inviteCode: "X" }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...base, displayName: "Jane", inviteCode: " " }).success,
    ).toBe(false);
  });
});

describe("auth form schemas", () => {
  it("validates login and forgot-password emails", () => {
    expect(loginSchema.safeParse({ email: "x@y.co", password: "p" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "", password: "p" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("validates new passwords", () => {
    expect(
      newPasswordSchema.safeParse({ password: "secret123", confirmPassword: "secret123" }).success,
    ).toBe(true);
    const empty = newPasswordSchema.safeParse({ password: "", confirmPassword: "" });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(firstError(empty.error)).toBe("Please enter a new password");
  });

  it("normalizes doctor setup input", () => {
    const r = doctorSetupSchema.safeParse({ name: " Jane ", code: "abc" });
    expect(r.success && r.data).toEqual({ name: "Jane", code: "ABC" });
  });
});

describe("parseJson", () => {
  it("returns parsed data, or null for bad JSON / wrong shape", () => {
    expect(parseJson('{"dailyTips":true}', notificationSettingsSchema)).toEqual({
      dailyTips: true,
    });
    expect(parseJson("{oops", notificationSettingsSchema)).toBeNull();
    expect(parseJson('{"dailyTips":"yes"}', notificationSettingsSchema)).toBeNull();
    expect(parseJson(null, notificationSettingsSchema)).toBeNull();
  });
});
