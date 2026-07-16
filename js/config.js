/* ==========================================
   DP_Jagd V2
   config.js
========================================== */

const CONFIG = {
    APP_NAME: "DP Jagd",
    VERSION: "2.0.0",
    SUPABASE_URL: "https://cgbnifbttqybkbpiadns.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_u6mg9P8YsZCOLoHyMMiPlQ_hXKF_dJ4"
};

if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase konnte nicht geladen werden.");
}

const db = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);

let CURRENT_USER = null;
