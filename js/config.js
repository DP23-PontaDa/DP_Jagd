/* ==========================================
   DP_Jagd V2
   config.js
========================================== */

const CONFIG = {

    APP_NAME: "DP Jagd",

    VERSION: "2.0.0",

    SUPABASE_URL: "https://cgbnifbttqybkbpiadns.supabase.co",

    SUPABASE_KEY: "sb_publishable_u6mg9P8YsZCOLoHyMMiPlQ_hXKF_dJ4"

};

const { createClient } = supabase;

const db = createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_KEY
);
