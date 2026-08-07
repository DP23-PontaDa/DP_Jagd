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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return antwort({ error: "Methode nicht erlaubt." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return antwort({ error: "Die Anmeldung ist nicht konfiguriert." }, 500);
  }

  const eingabe = await request.json().catch(() => ({}));
  const benutzername = String(eingabe.benutzername || "").trim();
  const passwort = String(eingabe.passwort || "");
  if (!/^[A-Za-z0-9ÄÖÜäöüß._-]{3,50}$/.test(benutzername) || !passwort) {
    return antwort({ error: "Anmeldung fehlgeschlagen." }, 400);
  }

  const profilAntwort = await fetch(
    `${supabaseUrl}/rest/v1/app_benutzerprofile?benutzername=ilike.${encodeURIComponent(benutzername)}&select=email,aktiv&limit=1`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  const profile = profilAntwort.ok ? await profilAntwort.json() : [];
  const profil = Array.isArray(profile) ? profile[0] : null;
  if (!profil?.email || profil.aktiv !== true) {
    return antwort({ error: "Benutzername oder Passwort ist nicht korrekt." }, 401);
  }

  const authAntwort = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: profil.email, password: passwort }),
  });
  const session = await authAntwort.json().catch(() => ({}));
  if (!authAntwort.ok || !session.access_token || !session.refresh_token) {
    return antwort({ error: "Benutzername oder Passwort ist nicht korrekt." }, 401);
  }

  return antwort({ access_token: session.access_token, refresh_token: session.refresh_token });
});
