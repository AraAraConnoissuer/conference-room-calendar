import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type ReviewBody = {
  requestId?: string;
  decision?: 'approved' | 'denied';
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase function environment variables.' }, 500);
  }

  const authorization = request.headers.get('Authorization') || '';
  if (!authorization) {
    return jsonResponse({ error: 'Authentication required.' }, 401);
  }

  const body = (await request.json().catch(() => ({}))) as ReviewBody;
  if (!body.requestId || !['approved', 'denied'].includes(String(body.decision))) {
    return jsonResponse({ error: 'requestId and valid decision are required.' }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } }
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authUser, error: authError } = await userClient.auth.getUser();
  if (authError || !authUser.user) {
    return jsonResponse({ error: 'Authentication required.' }, 401);
  }

  const { data: adminProfile, error: adminError } = await serviceClient
    .from('profiles')
    .select('id, role')
    .eq('id', authUser.user.id)
    .single();

  if (adminError || adminProfile?.role !== 'admin') {
    return jsonResponse({ error: 'Only admins can review password reset requests.' }, 403);
  }

  const { data: resetRequest, error: requestError } = await serviceClient
    .from('password_reset_requests')
    .select('*')
    .eq('id', body.requestId)
    .eq('status', 'pending')
    .single();

  if (requestError || !resetRequest) {
    return jsonResponse({ error: 'Pending password reset request not found.' }, 404);
  }

  if (body.decision === 'denied') {
    const { error } = await serviceClient
      .from('password_reset_requests')
      .update({
        status: 'denied',
        reviewed_by: authUser.user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', body.requestId);

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ status: 'denied' });
  }

  const normalizedStudentNumber = normalizeStudentNumber(resetRequest.student_number);
  const { data: targetProfile, error: targetError } = await serviceClient
    .from('profiles')
    .select('id, student_number')
    .eq('student_number', normalizedStudentNumber)
    .single();

  if (targetError || !targetProfile) {
    return jsonResponse({ error: 'No account found for this student number.' }, 404);
  }

  const temporaryPassword = generateTemporaryPassword();
  const { data: targetUser, error: targetUserError } = await serviceClient.auth.admin.getUserById(targetProfile.id);
  if (targetUserError || !targetUser.user) {
    return jsonResponse({ error: 'Target auth user not found.' }, 404);
  }

  const userMetadata = {
    ...(targetUser.user.user_metadata || {}),
    must_change_password: true
  };

  const { error: updateError } = await serviceClient.auth.admin.updateUserById(targetProfile.id, {
    password: temporaryPassword,
    user_metadata: userMetadata
  });

  if (updateError) {
    return jsonResponse({ error: updateError.message }, 500);
  }

  const { error: reviewError } = await serviceClient
    .from('password_reset_requests')
    .update({
      status: 'approved',
      reviewed_by: authUser.user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', body.requestId);

  if (reviewError) {
    return jsonResponse({ error: reviewError.message }, 500);
  }

  return jsonResponse({ status: 'approved', temporaryPassword });
});

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function normalizeStudentNumber(value: string) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}
