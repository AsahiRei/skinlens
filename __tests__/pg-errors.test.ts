import { describe, expect, it } from "@jest/globals";
import { friendlyError, isTransportSyncError } from "@/lib/db/pg-errors";

describe("friendlyError", () => {
  it("passes through messages raised by our SQL functions", () => {
    expect(friendlyError(new Error("Invalid invite code."))).toBe("Invalid invite code.");
  });
  it("hides row-level security internals", () => {
    expect(
      friendlyError({
        message: 'new row violates row-level security policy for table "user_profile"',
        code: "42501",
      }),
    ).toBe("You don't have permission to do that.");
  });
  it("maps network failures", () => {
    expect(friendlyError(new TypeError("Network request failed"))).toMatch(/internet connection/);
  });
  it("hides schema errors behind the fallback", () => {
    expect(friendlyError({ message: "Could not find the function", code: "PGRST202" }, "F")).toBe(
      "F",
    );
  });
  it("maps duplicates", () => {
    expect(
      friendlyError({ message: "duplicate key value violates unique constraint", code: "23505" }),
    ).toBe("That already exists.");
  });
});

describe("isTransportSyncError", () => {
  it("matches thrown fetch failures", () => {
    expect(isTransportSyncError(new TypeError("Network request failed"))).toBe(true);
    expect(isTransportSyncError(new Error("The operation was aborted"))).toBe(true);
  });
  it("matches PostgREST-style returned error objects", () => {
    expect(
      isTransportSyncError({
        message: "TypeError: Network request failed",
        details: "",
        hint: "",
        code: "",
      }),
    ).toBe(true);
  });
  it("does not treat code bugs or server errors as offline", () => {
    expect(
      isTransportSyncError(new TypeError("Cannot read properties of undefined (reading 'id')")),
    ).toBe(false);
    expect(
      isTransportSyncError({
        message: "duplicate key value violates unique constraint",
        code: "23505",
      }),
    ).toBe(false);
    expect(isTransportSyncError(null)).toBe(false);
  });
});
