// ── Helpers ───────────────────────────────────────────────────────────────

function driveImgUrl(url) {
  if (!url) return url;
  if (url.indexOf('drive.google.com/thumbnail') !== -1 ||
      url.indexOf('uc?') !== -1 || url.indexOf('uc&') !== -1) return url;
  var m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
          url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w200';
  return url;
}

var AVATAR_CLASSES = ['avatar-blue', 'avatar-green', 'avatar-purple', 'avatar-amber', 'avatar-rose'];
function avatarClass(i) { return AVATAR_CLASSES[i % AVATAR_CLASSES.length]; }
function initials(name) {
  var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function timeNow() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function showMsg(type, text) {
  var el = document.getElementById('dashboardMessage');
  el.className = 'state-msg ' + type;
  el.innerHTML = '<span>' + text + '</span>';
  el.style.display = 'flex';
}
function hideMsg() {
  var el = document.getElementById('dashboardMessage');
  if (el) el.style.display = 'none';
}

// ── Refresh ────────────────────────────────────────────────────────────────

var _session = null;

function refreshDashboard() {
  var btn = document.getElementById('refreshBtn');
  if (btn) { btn.textContent = '⏳ Refreshing…'; btn.disabled = true; }
  loadDashboard(function () {
    if (btn) { btn.textContent = '🔄 Refresh'; btn.disabled = false; }
  });
}

// ── Main dashboard loader ──────────────────────────────────────────────────

async function loadDashboard(onDone) {
  try {
    var result = await apiRequest('getDashboard');
    if (!result || !result.ok) {
      showMsg('warn', result && result.message ? result.message : 'Unable to load dashboard.');
      if (onDone) onDone();
      return;
    }

    // ── Stat cards ──
    var stats = [
      { label: 'Principals',    value: result.principals || 0, cls: 'stat-blue',   icon: '👑' },
      { label: 'Teachers',      value: result.teachers   || 0, cls: 'stat-green',  icon: '👩‍🏫' },
      { label: 'Students',      value: result.students   || 0, cls: 'stat-amber',  icon: '🎓' },
      { label: 'Grade Entries', value: result.grades     || 0, cls: 'stat-purple', icon: '📝' },
      { label: 'Classes',       value: result.classes    || 0, cls: 'stat-rose',   icon: '🏫' }
    ];
    var purpleStyle = 'position:absolute;top:0;left:0;right:0;height:3px;border-radius:14px 14px 0 0;background:#7c3aed;';
    document.getElementById('summaryCards').innerHTML = stats.map(function (s) {
      return '<div class="stat-card ' + s.cls + '" style="position:relative;">' +
        '<span class="stat-icon">' + s.icon + '</span>' +
        (s.cls === 'stat-purple'
          ? '<div style="' + purpleStyle + '"></div><span class="stat-value" style="color:#a78bfa;">' + s.value + '</span>'
          : '<span class="stat-value">' + s.value + '</span>') +
        '<span class="stat-label">' + s.label + '</span></div>';
    }).join('');

    // ── Grade coverage bar ──
    var students = result.students || 0;
    var grades   = result.grades   || 0;
    if (students > 0) {
      var pct     = Math.min(100, Math.round((grades / (students * 6)) * 100));
      var fillCls = pct >= 75 ? 'fill-green' : pct >= 40 ? 'fill-amber' : 'fill-rose';
      document.getElementById('coverageBars').innerHTML =
        '<div class="cov-bar-wrap">' +
          '<div class="cov-bar-label"><span>Overall Grade Entry Coverage</span><span>' + pct + '%</span></div>' +
          '<div class="cov-bar-track"><div class="cov-bar-fill ' + fillCls + '" style="width:' + pct + '%;"></div></div>' +
        '</div>' +
        '<p style="margin:8px 0 0;font-size:0.75rem;color:#64748b;">' + grades + ' entries recorded across ' + students + ' students</p>';
      document.getElementById('coveragePanel').style.display = 'block';
    }

    // ── Recent Teachers (last 5) ──
    var teachers = (result.recentTeachers || []).slice(0, 5);
    document.getElementById('teacherList').innerHTML = teachers.length
      ? teachers.map(function (t, i) {
          var name    = String(t.FullName || t.Username || 'Teacher').trim();
          var user    = String(t.Username || '').trim();
          var classes = String(t.AssignedClasses  || 'ALL').trim();
          var subjs   = String(t.AssignedSubjects || 'ALL').trim();
          var status  = String(t.Status || 'active').trim().toLowerCase();
          var isActive = status === 'active';
          var tags = '';
          if (classes !== 'ALL') {
            classes.split(',').slice(0, 3).forEach(function (c) {
              tags += '<span class="ptag ptag-blue">' + c.trim() + '</span>';
            });
          } else {
            tags += '<span class="ptag ptag-green">All Classes</span>';
          }
          if (subjs !== 'ALL') {
            subjs.split(',').slice(0, 2).forEach(function (s) {
              tags += '<span class="ptag ptag-amber">' + s.trim() + '</span>';
            });
          } else {
            tags += '<span class="ptag ptag-amber">All Subjects</span>';
          }
          return '<div class="person-row">' +
            '<div class="person-avatar ' + avatarClass(i) + '">' + initials(name) + '</div>' +
            '<div class="person-info">' +
              '<div class="person-name">' + name + '</div>' +
              '<div class="person-meta">' +
                '<span class="status-dot ' + (isActive ? 'dot-active' : 'dot-inactive') + '"></span>' +
                '@' + user + ' &nbsp;·&nbsp; ' + (isActive ? 'Active' : 'Inactive') +
              '</div>' +
              '<div class="person-tags">' + tags + '</div>' +
            '</div></div>';
        }).join('')
      : '<div class="state-msg warn"><span>📭</span><span>No teachers found.</span></div>';

    // ── Recent Students (last 5) ──
    var studs = (result.recentStudents || []).slice(0, 5);
    document.getElementById('studentList').innerHTML = studs.length
      ? studs.map(function (s, i) {
          var name   = String(s.FullName || s.StudentName || 'Student').trim();
          var id     = String(s.StudentID || s['Student ID'] || '').trim();
          var cls    = String(s.Class || s.Grade || '').trim();
          var gender = String(s.Gender || '').trim();
          var year   = String(s.AcademicYear || '').trim();
          return '<div class="person-row">' +
            '<div class="person-avatar ' + avatarClass(i + 2) + '">' + initials(name) + '</div>' +
            '<div class="person-info">' +
              '<div class="person-name">' + name + '</div>' +
              '<div class="person-meta">ID: ' + (id || '—') + (gender ? ' &nbsp;·&nbsp; ' + gender : '') + '</div>' +
              '<div class="person-tags">' +
                (cls  ? '<span class="ptag ptag-blue">'   + cls  + '</span>' : '') +
                (year ? '<span class="ptag ptag-purple">' + year + '</span>' : '') +
              '</div>' +
            '</div></div>';
        }).join('')
      : '<div class="state-msg warn"><span>📭</span><span>No students found.</span></div>';

    // ── Class breakdown (uses full student list for accuracy) ──
    var classMap = {};
    (result.allStudents || result.recentStudents || []).forEach(function (s) {
      var c = String(s.Class || s.Grade || 'Unknown').trim();
      var g = String(s.Gender || '').trim().toLowerCase();
      if (!classMap[c]) classMap[c] = { male: 0, female: 0, total: 0 };
      classMap[c].total++;
      if (g === 'male')   classMap[c].male++;
      else if (g === 'female') classMap[c].female++;
    });
    var classEntries = Object.keys(classMap).sort();
    var maxCount = classEntries.reduce(function (m, c) { return Math.max(m, classMap[c].total); }, 1);
    document.getElementById('classBreakdown').innerHTML = classEntries.length
      ? '<table class="class-table"><thead><tr><th>Class</th><th>♂ Male</th><th>♀ Female</th><th>Total</th><th></th></tr></thead><tbody>' +
        classEntries.map(function (c) {
          var d    = classMap[c];
          var barW = Math.round((d.total / maxCount) * 80);
          return '<tr><td>' + c + '</td><td style="color:#60a5fa;">' + d.male + '</td><td style="color:#f472b6;">' + d.female + '</td><td style="font-weight:600;">' + d.total + '</td>' +
            '<td><span class="class-count-bar" style="width:' + barW + 'px;"></span></td></tr>';
        }).join('') +
        '<tr><td style="color:#64748b;font-size:0.75rem;" colspan="5">All ' + (result.students || 0) + ' students · ' + classEntries.length + ' classes</td></tr>' +
        '</tbody></table>'
      : '<div class="state-msg info"><span>ℹ️</span><span>No class data available.</span></div>';

    // ── Subject overview ──
    var subjectMap = {};
    (result.recentTeachers || []).forEach(function (t) {
      var subjs = String(t.AssignedSubjects || '').trim();
      if (!subjs || subjs.toUpperCase() === 'ALL') return;
      subjs.split(',').forEach(function (s) {
        var key = s.trim();
        if (key) subjectMap[key] = (subjectMap[key] || 0) + 1;
      });
    });
    var subjEntries = Object.keys(subjectMap).sort();
    document.getElementById('subjectOverview').innerHTML = subjEntries.length
      ? '<div style="display:flex;flex-wrap:wrap;gap:8px;padding-top:4px;">' +
        subjEntries.map(function (s) {
          return '<span class="ptag ptag-blue" style="font-size:0.78rem;padding:4px 12px;">' +
            s + ' <span style="color:#64748b;font-weight:400;">×' + subjectMap[s] + '</span></span>';
        }).join('') + '</div>' +
        '<p style="margin:12px 0 0;font-size:0.75rem;color:#64748b;">Teacher count per subject shown</p>'
      : '<div class="state-msg info"><span>ℹ️</span><span>No subject assignments found.</span></div>';

    // ── Meta bar ──
    var yearVal = '';
    (result.recentStudents || []).forEach(function (s) {
      if (s.AcademicYear) yearVal = String(s.AcademicYear).trim();
    });
    document.getElementById('metaYear').textContent = yearVal || '—';
    document.getElementById('metaRefreshed').textContent = timeNow();

    showMsg('ok', '✓ Dashboard loaded from live data.');
    setTimeout(function () { hideMsg(); }, 3000);

  } catch (err) {
    showMsg('warn', 'Could not load dashboard: ' + err.message);
  }
  if (onDone) onDone();
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function () {
  guardRoute('principal');

  document.getElementById('metaDate').textContent = formatDate(new Date());

  _session = getSession();
  if (!_session) return;

  // Load principal profile
  try {
    var result = await apiRequest('getPrincipalProfile', { username: _session.username });
    if (result && result.ok && result.user) {
      var u = result.user;
      document.getElementById('principalName').textContent = 'Welcome, ' + (u.FullName || _session.username);
      document.getElementById('principalMeta').textContent = 'Role: Principal  |  @' + _session.username;
      if (u.PhotoLink) {
        document.getElementById('principalPhotoWrap').innerHTML =
          '<img src="' + driveImgUrl(u.PhotoLink) + '" alt="Principal photo" ' +
          'onerror="this.parentNode.innerHTML=\'<div class=no-photo>&#128100;</div>\'" />';
      }
    }
  } catch (e) { /* silently ignore */ }

  // Load dashboard data
  loadDashboard(null);
});