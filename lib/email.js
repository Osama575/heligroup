// MOCK — logs the email to the console instead of sending.
// Swap back to the nodemailer version when SMTP is configured.

export async function sendEmail({ to, subject, text, replyTo }) {
  console.log(`[mock-email] to=${to} subject="${subject}" replyTo=${replyTo ?? "—"}`);
  console.log(`[mock-email] body:\n${text}\n`);
  return { messageId: `mock-${Date.now()}` };
}

export function isEmailConfigured() {
  return true; // always "configured" in mock mode so booking paths run fully
}
