document.addEventListener('DOMContentLoaded', function () {
  var form    = document.getElementById('loginForm');
  var message = document.getElementById('loginMessage');

  if (!form) return;

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var username = document.getElementById('username').value.trim();
    var password = document.getElementById('password').value;

    if (!username || !password) {
      showLoginMsg('Please enter both username and password.', 'warn');
      return;
    }

    showLoginMsg('Signing in…', 'info');
    try {
      var result = await apiRequest('login', { username: username, password: password });

      if (result.ok) {
        // Check status BEFORE allowing login
        var status = String(result.status || 'active').toLowerCase();

        if (status === 'blocked') {
          showLoginMsg('🚫 Your account has been blocked. Please contact your administrator.', 'blocked');
          return;
        }
        if (status === 'inactive') {
          showLoginMsg('⚠️ Your account is inactive. Please contact your administrator.', 'warn');
          return;
        }

        setSession({ username: username, role: result.role || 'teacher', status: status, token: result.token });
        showLoginMsg('Login successful! Redirecting…', 'ok');
        if (result.role === 'principal') window.location.href = 'admin.html';
        else window.location.href = 'teacher.html';

      } else {
        showLoginMsg(result.message || 'Invalid username or password.', 'warn');
      }
    } catch (error) {
      showLoginMsg('Could not reach the server. Please try again.', 'warn');
    }
  });

  function showLoginMsg(text, type) {
    if (!message) return;
    message.textContent = text;
    message.className = 'login-msg login-msg-' + type;
  }
});

function guardRoute(expectedRole) {
  var session = getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  var role = String(session.role || '').trim().toLowerCase();
  var allowed = expectedRole;
  if (!Array.isArray(allowed)) allowed = [allowed];
  allowed = allowed.map(function(r) { return String(r || '').toLowerCase(); });

  if (allowed.indexOf(role) === -1) {
    window.location.href = 'login.html';
    return;
  }

  var status = String(session.status || 'active').toLowerCase();
  if (status === 'blocked' || status === 'inactive') {
    clearSession();
    window.location.href = 'login.html';
    return;
  }
}

function logoutUser() {
  apiRequest('logout').catch(function () { /* ignore — we clear locally regardless */ }).then(function () {
    clearSession();
    window.location.href = 'login.html';
  });
}

function getSessionStatus() {
  var s = getSession();
  return s ? String(s.status || 'active').toLowerCase() : 'active';
}