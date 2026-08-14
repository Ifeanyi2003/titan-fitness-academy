import { getSupabase } from './supabase-client.js';

const form = document.getElementById('loginForm');
const errorBox = document.getElementById('formError');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.remove('visible');
  submitBtn.disabled = true;
  submitBtn.textContent = 'LOGGING IN...';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const supabase = await getSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showError(error.message);
    return;
  }

  // If signup.js deferred a plan request (email confirmation was required at signup),
  // submit it now that we have a real authenticated session.
  const pendingPlan = localStorage.getItem('titan_pending_plan');
  if (pendingPlan && data.user) {
    const { error: reqError } = await supabase
      .from('plan_requests')
      .insert({
        user_id: data.user.id,
        requested_plan: pendingPlan,
        request_type: 'new'
      });

    if (!reqError) {
      localStorage.removeItem('titan_pending_plan');
    } else {
      console.error('Deferred plan request failed:', reqError.message);
    }
  }

  // Route based on role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  window.location.href = profile?.role === 'admin' ? 'admin.html' : 'dashboard.html';
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.add('visible');
  submitBtn.disabled = false;
  submitBtn.textContent = 'LOG IN';
}