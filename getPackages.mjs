// Netlify Function: Read recent package intake records from Airtable (requires Netlify Identity auth)
export async function handler(event, context) {
  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const user = context.clientContext && context.clientContext.user;
    if (!user) {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } = process.env;
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
      return { statusCode: 500, body: JSON.stringify({ error: "Server not configured (missing Airtable env vars)." }) };
    }

    const params = new URLSearchParams();
    params.set("pageSize", "50");
    params.set("sort[0][field]", "Received At");
    params.set("sort[0][direction]", "desc");

    const url = `https://api.airtable.com/v0/${encodeURIComponent(AIRTABLE_BASE_ID)}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?${params.toString()}`;

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "Airtable error", details: data }) };
    }

    return { statusCode: 200, body: JSON.stringify({ records: data.records || [] }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server error", message: err?.message || String(err) }) };
  }
}
