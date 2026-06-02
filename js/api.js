const API_URL = 'https://script.google.com/macros/s/AKfycbyGkzgEbrlyRCLjlFug9xv8dYMekqC-3LiuLkfDO5Kj7k-FlWXOBh4gFqpKQgYn7msg/exec';

async function apiRequest(action, data = {}) {
  // Send as form-encoded. Apps Script reads e.parameter reliably for all fields.
  // We also put the full JSON in a 'payload' param so the server can parse nested data.
  const formBody = new URLSearchParams();
  formBody.append('action', action);
  formBody.append('payload', JSON.stringify(data));

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
    redirect: 'follow'
  });

  return response.json();
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
