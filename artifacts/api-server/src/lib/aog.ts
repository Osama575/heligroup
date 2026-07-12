export async function dispatchAog(args: {
  summaryLine: string;
  visitor: Record<string, unknown>;
  aircraft?: Record<string, unknown>;
  enquiry?: Record<string, unknown>;
}): Promise<{ email: string; sms: string; whatsapp: string; errors: string[] }> {
  const { summaryLine, visitor, aircraft, enquiry } = args;
  const fullName =
    [visitor["first_name"], visitor["last_name"]].filter(Boolean).join(" ") || "(unknown)";
  console.log(`[mock-aog] URGENT — ${summaryLine}`);
  console.log(`[mock-aog] Visitor: ${fullName} <${visitor["email"] ?? "—"}>`);
  console.log(
    `[mock-aog] Aircraft: ${aircraft?.["type"] ?? "—"} ${aircraft?.["registration"] ?? ""} @ ${aircraft?.["location"] ?? "—"}`,
  );
  console.log(`[mock-aog] Detail: ${enquiry?.["details"] ?? "—"}`);
  return { email: "mock", sms: "mock", whatsapp: "mock", errors: [] };
}
