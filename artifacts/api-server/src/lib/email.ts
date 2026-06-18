export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<{ messageId: string }> {
  const { to, subject, replyTo } = args;
  console.log(`[mock-email] to=${to} subject="${subject}" replyTo=${replyTo ?? "—"}`);
  return { messageId: `mock-${Date.now()}` };
}

export function isEmailConfigured(): boolean {
  return true;
}
