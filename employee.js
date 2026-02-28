/* Employee Receiving Portal (Netlify Identity + Netlify Function) */
(function () {
  const $ = (id) => document.getElementById(id);

  const loginBtn = $("loginBtn");
  const logoutBtn = $("logoutBtn");
  const authDot = $("authDot");
  const authText = $("authText");
  const userPill = $("userPill");

  const form = $("intakeForm");
  const submitBtn = $("submitBtn");
  const resetBtn = $("resetBtn");
  const msgOk = $("msgOk");
  const msgErr = $("msgErr");

  const gridSection = $("gridSection");
  const gridBody = $("gridBody");
  const refreshBtn = $("refreshBtn");

  const fields = {
    trackingNumber: $("trackingNumber"),
    customerName: $("customerName"),
    carrier: $("carrier"),
    packageType: $("packageType"),
    weight: $("weight"),
    supplier: $("supplier"),
    island: $("island"),
    itemDescription: $("itemDescription"),
    packagePhoto: $("packagePhoto"),
  };

  const CARRIERS = ["UPS", "USPS", "FedEx", "DHL", "Amazon", "Other"];
  const TYPES = ["Box", "Package"];
  const ISLANDS = ["Abaco", "Freeport", "Nassau", "Bimini"];

  function showMsg(ok, text) {
    msgOk.style.display = "none";
    msgErr.style.display = "none";
    if (ok) {
      msgOk.textContent = text || "Saved successfully.";
      msgOk.style.display = "block";
    } else {
      msgErr.textContent = text || "Something went wrong.";
      msgErr.style.display = "block";
    }
  }

  function setAuthedUI(user) {
    const authed = !!user;
    authDot.classList.toggle("ok", authed);
    authText.textContent = authed ? "Signed in" : "Not signed in";
    loginBtn.style.display = authed ? "none" : "inline-flex";
    logoutBtn.style.display = authed ? "inline-flex" : "none";
    form.style.display = authed ? "block" : "none";
    gridSection.style.display = authed ? "block" : "none";
    userPill.style.display = authed ? "inline-flex" : "none";
    userPill.textContent = authed ? `User: ${user.email}` : "";
    msgOk.style.display = "none";
    msgErr.style.display = "none";

    if (authed) {
      // Load grid in the background (best-effort)
      loadGrid().catch(() => {});
    }
  }

  async function getJwt() {
    const user = window.netlifyIdentity && window.netlifyIdentity.currentUser();
    if (!user) return null;
    // netlify-identity-widget supports user.jwt()
    return await user.jwt();
  }

  function normalizeWeight(v) {
    // allow commas/spaces; keep as number
    const n = Number(String(v).replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  async function submitIntake(payload) {
    const token = await getJwt();
    if (!token) throw new Error("Not signed in.");

    const res = await fetch("/.netlify/functions/submitPackage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data && (data.error || data.message);
      throw new Error(msg || `Request failed (${res.status}).`);
    }
    return data;
  }

  async function apiCall(path, method, body) {
    const token = await getJwt();
    if (!token) throw new Error("Not signed in.");

    const res = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data && (data.error || data.message);
      throw new Error(msg || `Request failed (${res.status}).`);
    }
    return data;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function selectHtml(options, value) {
    const safe = String(value ?? "");
    const opts = [""].concat(options).map((o) => {
      const sel = o === safe ? " selected" : "";
      const label = o ? escapeHtml(o) : "Select…";
      const val = o ? escapeHtml(o) : "";
      const dis = o ? "" : " disabled";
      return `<option value="${val}"${sel}${dis}>${label}</option>`;
    });
    return opts.join("");
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  }

  async function fileToBase64(file) {
    if (!file) return null;
    // Airtable direct upload API is ~5MB per file
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Photo is too large. Please use an image under 5MB.");
    }
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function renderGrid(records) {
    if (!Array.isArray(records) || records.length === 0) {
      gridBody.innerHTML = `<tr><td class="muted" colspan="12">No packages yet.</td></tr>`;
      return;
    }

    gridBody.innerHTML = records
      .map((r) => {
        const f = r.fields || {};
        const photoUrl = (f["Package Photo"] && f["Package Photo"][0] && f["Package Photo"][0].thumbnails && (f["Package Photo"][0].thumbnails.small || f["Package Photo"][0].thumbnails.full))
          ? (f["Package Photo"][0].thumbnails.small || f["Package Photo"][0].thumbnails.full).url
          : (f["Package Photo"] && f["Package Photo"][0] ? f["Package Photo"][0].url : "");

        return `
        <tr data-id="${escapeHtml(r.id)}">
          <td class="muted">${escapeHtml(fmtDate(f["Received At"]))}</td>
          <td class="muted">${escapeHtml(f["Received By"] || "")}</td>
          <td><input class="cell-input" data-k="Tracking Number" value="${escapeHtml(f["Tracking Number"] || "")}" /></td>
          <td><input class="cell-input" data-k="Customer Name" value="${escapeHtml(f["Customer Name"] || "")}" /></td>
          <td><select class="cell-select" data-k="Island">${selectHtml(ISLANDS, f["Island"] || "")}</select></td>
          <td><select class="cell-select" data-k="Carrier">${selectHtml(CARRIERS, f["Carrier"] || "")}</select></td>
          <td><select class="cell-select" data-k="Package Type">${selectHtml(TYPES, f["Package Type"] || "")}</select></td>
          <td><input class="cell-input" data-k="Weight (lb)" inputmode="decimal" value="${escapeHtml(f["Weight (lb)"] ?? "")}" /></td>
          <td><input class="cell-input" data-k="Supplier" value="${escapeHtml(f["Supplier"] || "")}" /></td>
          <td><input class="cell-input" data-k="Item Description" value="${escapeHtml(f["Item Description"] || "")}" /></td>
          <td>
            <div style="display:flex; gap:10px; align-items:center;">
              ${photoUrl ? `<a href="${escapeHtml(photoUrl)}" target="_blank" rel="noopener"><img class="thumb" src="${escapeHtml(photoUrl)}" alt="photo" /></a>` : `<span class="muted">—</span>`}
              <input type="file" class="cell-input" data-k="__photo" accept="image/*" capture="environment" style="max-width:210px;" />
            </div>
          </td>
          <td>
            <div class="row-actions">
              <button class="btn sm primary" type="button" data-act="save">Save</button>
            </div>
            <div class="mini" data-act="status" style="margin-top:6px;"></div>
          </td>
        </tr>`;
      })
      .join("");
  }

  async function loadGrid() {
    if (!gridBody) return;
    gridBody.innerHTML = `<tr><td class="muted" colspan="12">Loading…</td></tr>`;
    const data = await apiCall("/.netlify/functions/getPackages", "GET");
    renderGrid(data.records || []);
  }

  function wireIdentity() {
    if (!window.netlifyIdentity) return;

    // If someone lands here after signup/login redirect, close modal
    window.netlifyIdentity.on("init", (user) => setAuthedUI(user));
    window.netlifyIdentity.on("login", (user) => {
      window.netlifyIdentity.close();
      setAuthedUI(user);
    });
    window.netlifyIdentity.on("logout", () => setAuthedUI(null));

    window.netlifyIdentity.init();
  }

  loginBtn.addEventListener("click", () => {
    if (!window.netlifyIdentity) return;
    window.netlifyIdentity.open("login");
  });

  logoutBtn.addEventListener("click", () => {
    if (!window.netlifyIdentity) return;
    window.netlifyIdentity.logout();
  });

  resetBtn.addEventListener("click", () => {
    form.reset();
    msgOk.style.display = "none";
    msgErr.style.display = "none";
    fields.trackingNumber.focus();
  });

  refreshBtn.addEventListener("click", () => {
    loadGrid().catch((e) => showMsg(false, e?.message || "Could not refresh."));
  });

  gridBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    if (act !== "save") return;

    const row = btn.closest("tr[data-id]");
    if (!row) return;

    const statusEl = row.querySelector('[data-act="status"]');
    const recordId = row.getAttribute("data-id");

    const inputs = Array.from(row.querySelectorAll("[data-k]"));
    const fieldsUpdate = {};
    let photoFile = null;

    for (const el of inputs) {
      const k = el.getAttribute("data-k");
      if (k === "__photo") {
        photoFile = el.files && el.files[0] ? el.files[0] : null;
        continue;
      }
      let v = el.value;
      if (k === "Weight (lb)") {
        const n = normalizeWeight(v);
        if (n === null) {
          statusEl.textContent = "Weight must be a positive number.";
          return;
        }
        v = n;
      }
      fieldsUpdate[k] = v;
    }

    btn.disabled = true;
    statusEl.textContent = "Saving…";
    try {
      let photo = null;
      if (photoFile) {
        const b64 = await fileToBase64(photoFile);
        photo = { base64: b64, filename: photoFile.name || "photo.jpg", contentType: photoFile.type || "image/jpeg" };
      }
      await apiCall("/.netlify/functions/updatePackage", "POST", { recordId, fields: fieldsUpdate, photo });
      statusEl.textContent = "Saved.";
      // refresh row thumbnails
      await loadGrid();
    } catch (err) {
      statusEl.textContent = err?.message || "Could not save.";
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        if (statusEl.textContent === "Saved.") statusEl.textContent = "";
      }, 2500);
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgOk.style.display = "none";
    msgErr.style.display = "none";

    const payload = {
      trackingNumber: fields.trackingNumber.value.trim(),
      customerName: fields.customerName.value.trim(),
      carrier: fields.carrier.value.trim(),
      packageType: fields.packageType.value.trim(),
      weight: normalizeWeight(fields.weight.value),
      supplier: fields.supplier.value.trim(),
      island: fields.island.value.trim(),
      itemDescription: fields.itemDescription.value.trim(),
    };

    if (!payload.trackingNumber || !payload.customerName || !payload.island || !payload.carrier || !payload.packageType || !payload.supplier || !payload.itemDescription) {
      showMsg(false, "Please fill out all required fields.");
      return;
    }
    if (payload.weight === null) {
      showMsg(false, "Weight must be a positive number (lb).");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving…";
    try {
      let photo = null;
      const file = fields.packagePhoto.files && fields.packagePhoto.files[0] ? fields.packagePhoto.files[0] : null;
      if (file) {
        const b64 = await fileToBase64(file);
        photo = { base64: b64, filename: file.name || "photo.jpg", contentType: file.type || "image/jpeg" };
      }
      payload.photo = photo;
      await submitIntake(payload);
      showMsg(true, "Saved. Package intake recorded.");
      form.reset();
      fields.trackingNumber.focus();
      loadGrid().catch(() => {});
    } catch (err) {
      showMsg(false, err && err.message ? err.message : "Could not save package.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Package";
    }
  });

  // Boot
  document.addEventListener("DOMContentLoaded", () => {
    // Identity widget may load after DOMContentLoaded; wait a tick
    const t = setInterval(() => {
      if (window.netlifyIdentity) {
        clearInterval(t);
        wireIdentity();
      }
    }, 50);
    setTimeout(() => clearInterval(t), 8000);
  });
})();
