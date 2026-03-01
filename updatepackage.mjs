// Netlify Function: Update a package record in Airtable (requires Netlify Identity auth)
export async function handler(event, context) {
  try {
    if (event.httpMethod !== "POST") {
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

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON." }) };
    }

    const recordId = String(payload.recordId || "").trim();
    const fields = payload.fields || {};
    const photo = payload.photo || null;
    if (!recordId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing recordId" }) };
    }

    // Lightweight validation
    if (fields["Weight (lb)"] !== undefined) {
      const w = Number(fields["Weight (lb)"]);
      if (!Number.isFinite(w) || w <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: "Weight must be a positive number." }) };
      }
      fields["Weight (lb)"] = w;
    }

    const url = `https://api.airtable.com/v0/${encodeURIComponent(AIRTABLE_BASE_ID)}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${encodeURIComponent(recordId)}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "Airtable error", details: data }) };
    }

    // Optional: upload/append photo
    if (photo && photo.base64) {
      const photoField = process.env.AIRTABLE_PHOTO_FIELD || "Package Photo";
      const uploadUrl = `https://content.airtable.com/v0/${encodeURIComponent(AIRTABLE_BASE_ID)}/${encodeURIComponent(recordId)}/${encodeURIComponent(photoField)}/uploadAttachment`;
      const up = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentType: photo.contentType || "image/jpeg",
          filename: photo.filename || "photo.jpg",
          file: photo.base64,
        }),
      });

      if (!up.ok) {
        const upData = await up.json().catch(() => ({}));
        return { statusCode: 200, body: JSON.stringify({ ok: true, updated: true, warning: "Photo upload failed", photoDetails: upData }) };
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, updated: true, record: data }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server error", message: err?.message || String(err) }) };
  }
}
