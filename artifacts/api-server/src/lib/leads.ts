export async function appendLead(record: Record<string, unknown>): Promise<void> {
  console.log(
    "[mock-leads] lead captured:",
    JSON.stringify({ logged_at: new Date().toISOString(), ...record }, null, 2),
  );
}
