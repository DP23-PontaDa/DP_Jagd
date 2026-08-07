const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function antwort(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function technischerLogin(benutzername: string) {
  return benutzername.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/ß/g, "ss")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function jsonAntwort(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return antwort({ error: "Methode nicht erlaubt." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization.startsWith("Bearer ")) {
    return antwort({ error: "Die Benutzerverwaltung ist nicht konfiguriert." }, 500);
  }

  const rechte = await jsonAntwort(`${supabaseUrl}/rest/v1/rpc/app_hat_recht`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ p_modul: "benutzerverwaltung", p_recht: "Bearbeiten" }),
  });
  if (!rechte.response.ok || rechte.body !== true) {
    return antwort({ error: "Das Recht Bearbeiten fehlt." }, 403);
  }

  const eingabe = await request.json().catch(() => ({}));
  const aktion = String(eingabe.aktion || "");
  const benutzerId = String(eingabe.benutzer_id || "").trim();
  const benutzername = String(eingabe.benutzername || "").trim();
  const passwort = String(eingabe.passwort || "");
  const rolleId = String(eingabe.rolle_id || "").trim();
  const aktiv = eingabe.aktiv === true;
  const login = technischerLogin(benutzername);
  const technischeEmail = `${login}@dpjagd.local`;

  if (!["anlegen", "speichern"].includes(aktion) || !rolleId ||
      !/^[A-Za-z0-9ÄÖÜäöüß._-]{3,50}$/.test(benutzername) || !login) {
    return antwort({ error: "Benutzername und Rolle sind ungültig." }, 400);
  }
  if ((aktion === "anlegen" && passwort.length < 6) ||
      (aktion === "speichern" && passwort && passwort.length < 6)) {
    return antwort({ error: "Das Passwort muss mindestens 6 Zeichen lang sein." }, 400);
  }
  if (aktion === "speichern" && !benutzerId) {
    return antwort({ error: "Benutzer-ID fehlt." }, 400);
  }

  const serviceHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  const rolle = await jsonAntwort(
    `${supabaseUrl}/rest/v1/app_rollen?id=eq.${encodeURIComponent(rolleId)}&select=id,name`,
    { headers: serviceHeaders },
  );
  if (!rolle.response.ok || !Array.isArray(rolle.body) || rolle.body.length !== 1) {
    return antwort({ error: "Die ausgewählte Rolle existiert nicht." }, 400);
  }

  const vorhanden = await jsonAntwort(
    `${supabaseUrl}/rest/v1/app_benutzerprofile?benutzername=ilike.${encodeURIComponent(benutzername)}&select=id&limit=1`,
    { headers: serviceHeaders },
  );
  const vorhandeneId = Array.isArray(vorhanden.body) ? String(vorhanden.body[0]?.id || "") : "";
  if (vorhandeneId && vorhandeneId !== benutzerId) {
    return antwort({ error: "Dieser Benutzername ist bereits vergeben." }, 409);
  }

  if (aktion === "speichern") {
    const ziel = await jsonAntwort(
      `${supabaseUrl}/rest/v1/app_benutzerprofile?id=eq.${encodeURIComponent(benutzerId)}&select=id,rolle:app_rollen(name)`,
      { headers: serviceHeaders },
    );
    const zielProfil = Array.isArray(ziel.body) ? ziel.body[0] : null;
    if (!zielProfil) return antwort({ error: "Benutzer wurde nicht gefunden." }, 404);
    if (zielProfil.rolle?.name === "Admin" && (!aktiv || rolle.body[0].name !== "Admin")) {
      return antwort({ error: "Admin darf nicht deaktiviert oder einer anderen Rolle zugeordnet werden." }, 400);
    }
  }

  let id = benutzerId;
  if (aktion === "anlegen") {
    const auth = await jsonAntwort(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        email: technischeEmail,
        password: passwort,
        email_confirm: true,
        user_metadata: { name: benutzername, benutzername },
        ban_duration: aktiv ? "none" : "876000h",
      }),
    });
    id = String(auth.body?.id || auth.body?.user?.id || "");
    if (!auth.response.ok || !id) {
      return antwort({ error: auth.body?.msg || auth.body?.message || "Benutzer konnte nicht angelegt werden." }, auth.response.status);
    }
  } else {
    const attribute: Record<string, unknown> = {
      email: technischeEmail,
      email_confirm: true,
      user_metadata: { name: benutzername, benutzername },
      ban_duration: aktiv ? "none" : "876000h",
    };
    if (passwort) attribute.password = passwort;
    const auth = await jsonAntwort(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: serviceHeaders,
      body: JSON.stringify(attribute),
    });
    if (!auth.response.ok) {
      return antwort({ error: auth.body?.msg || auth.body?.message || "Auth-Benutzer konnte nicht gespeichert werden." }, auth.response.status);
    }
  }

  const profil = await fetch(`${supabaseUrl}/rest/v1/app_benutzerprofile?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...serviceHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({
      benutzername,
      name: benutzername,
      email: technischeEmail,
      rolle_id: rolleId,
      aktiv,
    }),
  });
  if (!profil.ok) {
    return antwort({ error: await profil.text() || "Benutzerprofil konnte nicht gespeichert werden." }, 500);
  }

  return antwort({ id, benutzername });
});
