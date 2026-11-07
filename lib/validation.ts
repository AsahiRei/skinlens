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
