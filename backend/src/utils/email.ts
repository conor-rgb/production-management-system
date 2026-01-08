import sgMail from "@sendgrid/mail";

const apiKey = process.env.SENDGRID_API_KEY ?? "";
const fromEmail = process.env.FROM_EMAIL ?? "";

if (apiKey) {
  sgMail.setApiKey(apiKey);
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name?: string | null;
  resetLink: string;
}) {
  if (!apiKey || !fromEmail) {
    // eslint-disable-next-line no-console
    console.warn("SendGrid is not configured; skipping reset email.");
    return;
  }

  const greeting = params.name ? `Hi ${params.name},` : "Hi there,";
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0b0f1a;">
      <h2 style="margin-bottom: 12px;">Reset your password</h2>
      <p>${greeting}</p>
      <p>We received a request to reset your password for the Production Management System.</p>
      <p>
        <a href="${params.resetLink}" style="display: inline-block; background: #ff7a00; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Reset password</a>
      </p>
      <p>If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  await sgMail.send({
    to: params.to,
    from: fromEmail,
    subject: "Reset your Production Management password",
    html
  });
}
