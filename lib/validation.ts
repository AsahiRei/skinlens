import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Please enter your email")
  .pipe(z.email("Please enter a valid email address"));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password needs at least ${PASSWORD_MIN_LENGTH} characters`)
  .regex(/\d/, "Password needs at least one number");

const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, "Doctors need a hospital invite code");

/** The doctor name field shows a fixed "Dr." prefix, so drop it if typed or pasted. */
export function stripDrPrefix(name: string) {
  return name.replace(/^\s*dr\.?\s+/i, "");
}

/** Live checklist shown under password fields. Mirrors {@link passwordSchema}. */
export function getPasswordRules(password: string, confirm: string) {
  return [
    {
      key: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    { key: "number", label: "One number", met: /\d/.test(password) },
    { key: "match", label: "Passwords match", met: password.length > 0 && password === confirm },
  ];
}

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Please enter your password"),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const newPasswordSchema = z
  .object({
    password: z.string().min(1, "Please enter a new password").pipe(passwordSchema),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const registerBase = z.object({
  agreed: z.literal(true, "Please agree to the Terms and Conditions"),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
});

export const registerSchema = z
  .discriminatedUnion("isDoctor", [
    registerBase.extend({ isDoctor: z.literal(false) }),
    registerBase.extend({
      isDoctor: z.literal(true),
      displayName: z
        .string()
        .transform((name) => stripDrPrefix(name).trim())
        .pipe(z.string().min(1, "Please enter your name"))
        .transform((name) => `Dr. ${name}`),
      inviteCode: inviteCodeSchema,
    }),
  ])
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const doctorSetupSchema = z.object({
  name: z.string().trim().min(1, "Enter your full name and the hospital invite code."),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Enter your full name and the hospital invite code."),
});

export const notificationSettingsSchema = z
  .object({
    scanReminders: z.boolean(),
    dailyTips: z.boolean(),
    appointmentRequests: z.boolean(),
  })
  .partial();

export const doctorNotificationSettingsSchema = z
  .object({ appointmentRequests: z.boolean() })
  .partial();

/** Parses a JSON string against a schema, returning null on malformed JSON or a shape mismatch. */
export function parseJson<T>(raw: string | null, schema: z.ZodType<T>): T | null {
  if (!raw) return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** First validation message, for single-toast forms. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form";
}

export const FIRST_NAME_MAX_LENGTH = 50;

/** Trims and collapses inner whitespace so "  ana   marie " is stored as "ana marie". */
export function normalizeFirstName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Letters (any script) plus the separators real names use: space, hyphen, apostrophe, period.
 * Must start with a letter, so "123", "!!" or an emoji-only name are rejected.
 */
const FIRST_NAME_PATTERN = /^\p{L}[\p{L}\p{M} .'’-]*$/u;

/** Null when the name is acceptable, otherwise the message to show the user. */
export function firstNameError(name: string): string | null {
  const value = normalizeFirstName(name);
  if (value.length === 0) return "Please enter your first name";
  if (value.length < 2) return "Please enter at least 2 letters";
  if (value.length > FIRST_NAME_MAX_LENGTH)
    return `Please keep your name under ${FIRST_NAME_MAX_LENGTH} characters`;
  if (!FIRST_NAME_PATTERN.test(value))
    return "Please use letters only (spaces, hyphens and apostrophes are fine)";
  return null;
}
