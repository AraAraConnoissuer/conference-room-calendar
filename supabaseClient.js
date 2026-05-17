const SUPABASE_URL = 'https://oukygxniuiwfcflindlo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_K2Y0jQ6OOfspvQqfKYV_jA_5JMaMgav';

// Paste your real Supabase project URL and anon public key above.
// The app starts on the login page and requires these credentials for real accounts.
const hasSupabaseCredentials =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes('YOUR-SUPABASE-ANON-KEY');

const supabaseClient = hasSupabaseCredentials
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
