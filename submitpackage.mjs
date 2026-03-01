// Netlify Function: Save package intake to Airtable (requires Netlify Identity auth)
export async function handler(event, context) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    // Netlify verifies Identity JWT and injects the user here
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } = process.env;
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
      return { statusCode: 500, body: JSON.stringify({ error: "Server not configured (missing Airtable env vars)." }) };
    }

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON." }) };
    }

    const required = ["trackingNumber", "customerName", "island", "carrier", "packageType", "weight", "itemDescription", "supplier"];
    for (const k of required) {
      if (payload[k] === undefined || payload[k] === null || payload[k] === "") {
        return { statusCode: 400, body: JSON.stringify({ error: `Missing field: ${k}` }) };
      }
    }

    const weight = Number(payload.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Weight must be a positive number." }) };
    }

    const receivedAt = new Date().toISOString();
    const receivedBy = user.email || user.sub || "unknown";

    const fields = {
      "Tracking Number": String(payload.trackingNumber).trim(),
      "Customer Name": String(payload.customerName).trim(),
      "Island": String(payload.island).trim(),
      "Carrier": String(payload.carrier).trim(),
      "Package Type": String(payload.packageType).trim(),
      "Weight (lb)": weight,
      "Item Description": String(payload.itemDescription).trim(),
      "Supplier": String(payload.supplier).trim(),
      "Received At": receivedAt,
      "Received By": receivedBy,
    };

    const url = `https://api.airtable.com/v0/${encodeURIComponent(AIRTABLE_BASE_ID)}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: [{ fields }] }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: "Airtable error",
          details: data,
        }),
      };
    }


    const recordId = data && data.records && data.records[0] ? data.records[0].id : null;

    // Optional: photo upload to Airtable attachment field (direct upload API)
    // Docs: https://content.airtable.com/v0/{baseId}/{recordId}/{attachmentFieldIdOrName}/uploadAttachment
    if (recordId && payload.photo && payload.photo.base64) {
      const photoField = process.env.AIRTABLE_PHOTO_FIELD || "Package Photo";
      const uploadUrl = `https://content.airtable.com/v0/${encodeURIComponent(AIRTABLE_BASE_ID)}/${encodeURIComponent(recordId)}/${encodeURIComponent(photoField)}/uploadAttachment`;

      const up = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentType: payload.photo.contentType || "image/jpeg",
          filename: payload.photo.filename || "photo.jpg",
          file: payload.photo.base64,
        }),
      });

      // If photo upload fails, still return ok=true but include a warning
      if (!up.ok) {
        const upData = await up.json().catch(() => ({}));
        return {
          statusCode: 200,
          body: JSON.stringify({ ok: true, id: recordId, warning: "Photo upload failed", photoDetails: upData }),
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, id: recordId }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server error", message: err?.message || String(err) }) };
  }
}
