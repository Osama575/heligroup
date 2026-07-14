// MOCK — logs the lead record to the console instead of writing to disk.

export async function appendLead(record) {
  console.log("[mock-leads] lead captured:", JSON.stringify({
    logged_at: new Date().toISOString(),
    ...record,
  }, null, 2));
}
