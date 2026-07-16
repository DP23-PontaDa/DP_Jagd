/* ==========================================
   DP_Jagd V2
   config.js
========================================== */

const CONFIG = {

    APP_NAME: "DP Jagd",

    VERSION: "2.0.0",

    SUPABASE_URL: "https://cgbnifbttqybkbpiadns.supabase.co",

    SUPABASE_KEY: "HIER_DEINEN_SB_PUBLISHABLE_KEY_EINFÜGEN"

};

// Verbindung zu Supabase

const supabase = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_KEY
);
