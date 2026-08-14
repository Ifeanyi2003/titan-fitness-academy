import { getSupabase } from './supabase-client.js';

const form = document.getElementById('signupForm');
const errorBox = document.getElementById('formError');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.remove('visible');
  submitBtn.disabled = true;
  submitBtn.textContent = 'CREATING ACCOUNT...';

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const plan = document.getElementById('plan').value;

  const supabase = await getSupabase();

  // Step 1: create the auth account, storing full_name so the DB trigger can copy it into profiles
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });

  if (error) {
    showError(error.message);
    return;
  }

  // Step 2: if a session came back immediately (email confirmation disabled),
  // we can record their plan interest right now.
  if (data.session && data.user) {
    const { error: reqError } = await supabase
      .from('plan_requests')
      .insert({
        user_id: data.user.id,
        requested_plan: plan,
        request_type: 'new'
      });

    if (reqError) {
      // Account was created successfully even if this fails — don't block on it
      console.error('Plan request failed:', reqError.message);
    }

    window.location.href = 'dashboard.html';
    return;
  }

  // Step 3: email confirmation required — no session yet, so we can't insert
  // into plan_requests (RLS needs an authenticated user). Store the chosen
  // plan locally so we can submit the request the moment they first log in.
  localStorage.setItem('titan_pending_plan', plan);

  form.style.display = 'none';
  document.getElementById('successMessage').style.display = 'block';
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.add('visible');
  submitBtn.disabled = false;
  submitBtn.textContent = 'CREATE ACCOUNT';
}