const API_URL = 'https://script.google.com/macros/s/AKfycbzL1FBm4YQnNcZEfMVVEFT7s_6ZIrPmEgMBduWybd72G_qjECU0TZrvkSZcRNb6uMuq/exec';

async function apiRequest(action, data = {}) {
  // Attach the signed-in user's session token to every call except login,
  // so callers never have to remember to do this themselves.
  const session = getSession();
  const payload = Object.assign({}, data);
  if (action !== 'login' && session && session.token) {
    payload.sessionToken = session.token;
  }

  // Send as form-encoded. Apps Script reads e.parameter reliably for all fields.
  // We also put the full JSON in a 'payload' param so the server can parse nested data.
  const formBody = new URLSearchParams();
  formBody.append('action', action);
  formBody.append('payload', JSON.stringify(payload));

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
    redirect: 'follow'
  });

  const result = await response.json();

  // If the server says our session has died, clear it and bounce to login once.
  if (result && result.sessionExpired) {
    clearSession();
    if (typeof window !== 'undefined' && window.location && !window.location.pathname.endsWith('login.html')) {
      window.location.href = 'login.html';
    }
  }

  return result;
}

function setSession(user) {
  localStorage.setItem('schoolUser', JSON.stringify(user));
}

function getSession() {
  return JSON.parse(localStorage.getItem('schoolUser') || 'null');
}

function clearSession() {
  localStorage.removeItem('schoolUser');
}
