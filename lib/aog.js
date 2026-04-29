// MOCK — logs the AOG alert instead of dispatching via Twilio / SMTP.

export async function dispatchAog({ summaryLine, visitor, aircraft, enquiry }) {
  const fullName = [visitor.first_name, visitor.last_name].filter(Boolean).join(" ") || "(unknown)";
  console.log(`[mock-aog] URGENT — ${summaryLine}`);
  console.log(`[mock-aog] Visitor: ${fullName} <${visitor.email ?? "—"}>`);
  console.log(`[mock-aog] Aircraft: ${aircraft?.type ?? "—"} ${aircraft?.registration ?? ""} @ ${aircraft?.location ?? "—"}`);
  console.log(`[mock-aog] Detail: ${enquiry?.details ?? "—"}`);
  return { email: "mock", sms: "mock", whatsapp: "mock", errors: [] };
}
