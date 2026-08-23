import nodemailer, { type Transporter } from "nodemailer";

/** True when the minimum SMTP env (host + from) is present. */
export function isMailerConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

let transport: Transporter | null = null;
function getTransport(): Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      // Bound the worst-case send well under CLAIM_LEASE_MS (dispatch.ts): a
      // hung SMTP connection must fail fast instead of holding the claim
      // lease past its expiry, which would let the sweeper re-claim and
      // double-send.
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 20_000,
    });
  }
  return transport;
}

/** Send an email via the env-configured SMTP transport. Throws on failure.
 *
 *  `html` is optional and sent as an alternative, never as a replacement: the
 *  text part stays the message, and a client that shows it loses nothing but
 *  the button. */
export async function sendMail(opts: { to: string[]; subject: string; text: string; html?: string }): Promise<void> {
  await getTransport().sendMail({
    from: process.env.SMTP_FROM,
    to: opts.to.join(", "),
    subject: opts.subject,
    text: opts.text,
    ...(opts.html ? { html: opts.html } : {}),
  });
}
