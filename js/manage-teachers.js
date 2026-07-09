// ── Helpers ───────────────────────────────────────────────────────────────

var AV_COLORS = ['av-blue','av-green','av-purple','av-amber','av-rose'];
function avClass(i) { return AV_COLORS[i % AV_COLORS.length]; }
function initials(name) {
  var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1 ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}

function showToast(msg, type) {
  var el = document.getElementById('toast');
  el.textContent = (type === 'ok' ? '✓ ' : '✕ ') + msg;
  el.className = 'toast show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(function(){ el.classList.remove('show'); }, 3500);
}

function statusBadge(status) {
  var s = String(status || 'active').toLowerCase();
  if (s === 'blocked')  return '<span class="status-badge badge-blocked"><span class="sdot sdot-blocked"></span>Blocked</span>';
  if (s === 'inactive') return '<span class="status-badge badge-inactive"><span class="sdot sdot-inactive"></span>Inactive</span>';
  return '<span class="status-badge badge-active"><span class="sdot sdot-active"></span>Active</span>';
}

function driveImgUrl(url) {
  if (!url) return '';
  if (url.indexOf('drive.google.com/thumbnail') !== -1) return url;
  var m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w80';
  return url;
}

// ── State ─────────────────────────────────────────────────────────────────

var _allTeachers = [];
var _pendingDeleteUsername = '';
var _teacherShowAll = false;
var TEACHER_PAGE = 5;

// ── Load & render ─────────────────────────────────────────────────────────

async function loadTeachers() {
  var list = document.getElementById('teacherManageList');
  list.innerHTML = '<div class="state-msg info"><span>⏳</span><span>Loading teachers…</span></div>';
  try {
    var result = await apiRequest('listTeachers');
    if (!result || !result.ok) {
      list.innerHTML = '<div class="state-msg warn"><span>⚠️</span><span>' + (result && result.message ? result.message : 'Unable to load teachers.') + '</span></div>';
      return;
    }
    _allTeachers = result.teachers || [];
    _teacherShowAll = false;
    renderTeachers(_allTeachers, false);
  } catch(e) {
    list.innerHTML = '<div class="state-msg warn"><span>⚠️</span><span>Could not load teachers.</span></div>';
  }
}

function buildTeacherRow(t, i) {
  var name    = String(t.FullName || t.Username || 'Teacher').trim();
  var user    = String(t.Username || '').trim();
  var classes = String(t.AssignedClasses  || 'ALL').trim();
  var subjs   = String(t.AssignedSubjects || 'ALL').trim();
  var status  = String(t.Status || 'active').toLowerCase();
  var photoUrl = driveImgUrl(t.PhotoLink);

  var avatarHtml = photoUrl
    ? '<div class="t-avatar"><img src="' + photoUrl + '" alt="' + name + '" onerror="this.parentNode.innerHTML=\'<span>' + initials(name) + '</span>\'" /></div>'
    : '<div class="t-avatar ' + avClass(i) + '">' + initials(name) + '</div>';

  var tags = '';
  var year = String(t.AssignedAcademicYear || '').trim();
  if (year) tags += '<span class="ttag" style="background:rgba(139,92,246,0.12);border-color:rgba(139,92,246,0.3);color:#c4b5fd;">📅 ' + year + '</span>';
  if (classes !== 'ALL') {
    classes.split(',').slice(0,3).forEach(function(c){ tags += '<span class="ttag ttag-blue">' + c.trim() + '</span>'; });
  } else {
    tags += '<span class="ttag ttag-green">All Classes</span>';
  }
  if (subjs !== 'ALL') {
    subjs.split(',').slice(0,2).forEach(function(s){ tags += '<span class="ttag ttag-amber">' + s.trim() + '</span>'; });
  } else {
    tags += '<span class="ttag ttag-amber">All Subjects</span>';
  }

  return '<div class="teacher-row">' +
    avatarHtml +
    '<div class="t-info">' +
      '<div class="t-name">' + name + ' ' + statusBadge(status) + '</div>' +
      '<div class="t-meta">@' + user + (t.Phone ? ' · ' + t.Phone : '') + '</div>' +
      '<div class="t-tags">' + tags + '</div>' +
    '</div>' +
    '<div class="t-actions">' +
      '<button class="act-btn act-edit" onclick="openEditModal(\'' + user.replace(/'/g, "\\'") + '\')">✏️ Edit</button>' +
      '<button class="act-btn act-delete" onclick="openDeleteModal(\'' + user.replace(/'/g, "\\'") + '\',\'' + name.replace(/'/g, "\\'") + '\')">🗑️ Delete</button>' +
    '</div>' +
  '</div>';
}

function renderTeachers(teachers, showAll) {
  var list = document.getElementById('teacherManageList');
  if (!teachers.length) {
    list.innerHTML = '<div class="state-msg info"><span>📭</span><span>No teachers found.</span></div>';
    updateTeacherCount(0, 0);
    var footer = document.getElementById('teacherListFooter');
    if (footer) footer.style.display = 'none';
    return;
  }
  var visible = (showAll || _teacherShowAll) ? teachers : teachers.slice(0, TEACHER_PAGE);
  list.innerHTML = visible.map(function(t, i) { return buildTeacherRow(t, i); }).join('');

  var footer = document.getElementById('teacherListFooter');
  if (footer) {
    var remaining = teachers.length - visible.length;
    if (remaining > 0) {
      footer.innerHTML = '<button class="load-more-btn" onclick="showAllTeachers()">Show all ' + teachers.length + ' teachers (' + remaining + ' more)</button>';
      footer.style.display = 'block';
    } else {
      footer.style.display = 'none';
    }
  }
  updateTeacherCount(visible.length, teachers.length);
}

function updateTeacherCount(shown, total) {
  var el = document.getElementById('teacherCountLabel');
  if (!el) return;
  el.textContent = shown < total
    ? 'Showing ' + shown + ' of ' + total + ' teachers'
    : 'All ' + total + ' teacher' + (total !== 1 ? 's' : '');
}

window.showAllTeachers = function() {
  _teacherShowAll = true;
  var q = document.getElementById('teacherSearch').value.toLowerCase().trim();
  var filtered = q ? _allTeachers.filter(function(t) {
    return (t.FullName || '').toLowerCase().includes(q) ||
           (t.Username || '').toLowerCase().includes(q) ||
           (t.AssignedClasses || '').toLowerCase().includes(q) ||
           (t.AssignedSubjects || '').toLowerCase().includes(q);
  }) : _allTeachers;
  renderTeachers(filtered, true);
};

function filterTeachers() {
  var q = document.getElementById('teacherSearch').value.toLowerCase().trim();
  _teacherShowAll = false;
  if (!q) { renderTeachers(_allTeachers, false); return; }
  var filtered = _allTeachers.filter(function(t) {
    return (t.FullName || '').toLowerCase().includes(q) ||
           (t.Username || '').toLowerCase().includes(q) ||
           (t.AssignedClasses || '').toLowerCase().includes(q) ||
           (t.AssignedSubjects || '').toLowerCase().includes(q);
  });
  renderTeachers(filtered, false);
}

// ── Add teacher ───────────────────────────────────────────────────────────

window.submitAddTeacher = async function() {
  var fullName        = document.getElementById('teacherFullName').value.trim();
  var username        = document.getElementById('teacherUsername').value.trim();
  var password        = document.getElementById('teacherPassword').value;
  var assignedClasses = document.getElementById('teacherClasses').value.trim();
  var assignedSubjects = document.getElementById('teacherSubjects').value.trim();
  var assignedAcademicYear = document.getElementById('teacherAcademicYear').value.trim();
  var phone           = document.getElementById('teacherPhone').value.trim();
  var status          = document.getElementById('teacherStatus').value;
  var photoLink       = document.getElementById('teacherPhoto').value.trim();
  var msg             = document.getElementById('teacherMessage');

  if (!fullName || !username || !password) {
    msg.style.color = '#f87171';
    msg.textContent = 'Full name, username, and password are required.';
    return;
  }
  if (!assignedAcademicYear) {
    msg.style.color = '#f87171';
    msg.textContent = 'Please select an academic year for this teacher.';
    return;
  }
  msg.style.color = '#64748b';
  msg.textContent = 'Adding teacher…';
  var btn = document.getElementById('addTeacherBtn');
  btn.disabled = true;

  var result = await apiRequest('addTeacher', { fullName, username, password, assignedClasses, assignedSubjects, assignedAcademicYear, phone, status, photoLink });
  btn.disabled = false;
  if (result && result.ok) {
    msg.style.color = '#4ade80';
    msg.textContent = 'Teacher added successfully.';
    document.getElementById('teacherFullName').value = '';
    document.getElementById('teacherUsername').value = '';
    document.getElementById('teacherPassword').value = '';
    document.getElementById('teacherClasses').value  = '';
    document.getElementById('teacherSubjects').value = '';
    document.getElementById('teacherPhone').value    = '';
    document.getElementById('teacherStatus').value   = 'active';
    document.getElementById('teacherPhoto').value    = '';
    populateYearDropdown(document.getElementById('teacherAcademicYear'), _currentYear);
    showToast('Teacher added successfully.', 'ok');
    await loadTeachers();
  } else {
    msg.style.color = '#f87171';
    msg.textContent = result && result.message ? result.message : 'Could not add teacher.';
    showToast('Failed to add teacher.', 'err');
  }
};

// ── Edit modal ────────────────────────────────────────────────────────────

window.openEditModal = async function(username) {
  var teacher = _allTeachers.find(function(t) {
    return String(t.Username || '').toLowerCase() === String(username).toLowerCase();
  });
  if (!teacher) return;

  if (!_availableYears.length) await refreshCurrentYearLabel();

  document.getElementById('editUsername').value = teacher.Username || '';
  document.getElementById('editFullName').value = teacher.FullName || '';
  document.getElementById('editPassword').value = '';
  document.getElementById('editClasses').value  = teacher.AssignedClasses  || '';
  document.getElementById('editSubjects').value = teacher.AssignedSubjects || '';
  var teacherYear = String(teacher.AssignedAcademicYear || '').trim();
  // Guard against a teacher whose assigned year fell out of the fetched
  // list (e.g. its ENROLL_/GRADES_ sheets were deleted) - add it back so
  // the dropdown doesn't silently jump to a different year than reality.
  if (teacherYear && _availableYears.indexOf(teacherYear) === -1) {
    _availableYears.push(teacherYear);
    _availableYears.sort();
  }
  populateYearDropdown(document.getElementById('editAcademicYear'), teacherYear || _currentYear);
  document.getElementById('editPhone').value    = teacher.Phone || '';
  document.getElementById('editStatus').value   = String(teacher.Status || 'active').toLowerCase();
  document.getElementById('editPhoto').value    = teacher.PhotoLink || '';
  document.getElementById('editMessage').textContent = '';
  document.getElementById('editModalSub').textContent = 'Editing: ' + (teacher.FullName || teacher.Username);
  document.getElementById('editModal').classList.add('open');
};

window.closeEditModal = function() {
  document.getElementById('editModal').classList.remove('open');
};

window.saveTeacherEdit = async function() {
  var username        = document.getElementById('editUsername').value.trim();
  var fullName        = document.getElementById('editFullName').value.trim();
  var password        = document.getElementById('editPassword').value;
  var assignedClasses = document.getElementById('editClasses').value.trim();
  var assignedSubjects = document.getElementById('editSubjects').value.trim();
  var assignedAcademicYear = document.getElementById('editAcademicYear').value.trim();
  var phone           = document.getElementById('editPhone').value.trim();
  var status          = document.getElementById('editStatus').value;
  var photoLink       = document.getElementById('editPhoto').value.trim();
  var msg             = document.getElementById('editMessage');

  msg.textContent = 'Saving changes…';

  var payload = { username, fullName, assignedClasses, assignedSubjects, assignedAcademicYear, phone, status, photoLink };
  if (password) payload.password = password;

  var result = await apiRequest('updateTeacher', payload);
  if (result && result.ok) {
    closeEditModal();
    showToast('Teacher updated successfully.', 'ok');
    await loadTeachers();
  } else {
    msg.style.color = '#f87171';
    msg.textContent = result && result.message ? result.message : 'Update failed.';
  }
};

// ── Delete confirm modal ──────────────────────────────────────────────────

window.openDeleteModal = function(username, name) {
  _pendingDeleteUsername = username;
  document.getElementById('deleteTeacherName').textContent = name || username;
  document.getElementById('deleteModal').classList.add('open');
};

window.closeDeleteModal = function() {
  document.getElementById('deleteModal').classList.remove('open');
  _pendingDeleteUsername = '';
};

window.confirmDeleteTeacher = async function() {
  if (!_pendingDeleteUsername) return;
  var username = _pendingDeleteUsername;
  closeDeleteModal();
  var result = await apiRequest('deleteTeacher', { username });
  if (result && result.ok) {
    showToast('Teacher deleted.', 'ok');
  } else {
    showToast((result && result.message) || 'Delete failed.', 'err');
  }
  await loadTeachers();
};

// ── Academic year label + dropdowns ─────────────────────────────────────

var _availableYears = [];
var _currentYear = '';

async function refreshCurrentYearLabel() {
  var el = document.getElementById('currentYearLabel');
  try {
    var result = await apiRequest('listAcademicYears');
    if (result && result.ok) {
      _currentYear = result.current || '';
      _availableYears = (result.years || []).slice();
      if (_currentYear && _availableYears.indexOf(_currentYear) === -1) _availableYears.push(_currentYear);
      _availableYears.sort();
      if (el) el.textContent = _currentYear || '—';
      populateYearDropdown(document.getElementById('teacherAcademicYear'), _currentYear);
      populateYearDropdown(document.getElementById('editAcademicYear'), '');
    }
  } catch (e) { /* non-fatal */ }
}

// Fills a <select> with every known academic year. `selectValue`, if given,
// is selected by default (used for the Add form, which should default to
// the school's current year). The Edit modal instead sets its own value
// per-teacher in openEditModal, so it's called with an empty selectValue.
function populateYearDropdown(sel, selectValue) {
  if (!sel) return;
  sel.innerHTML = _availableYears.map(function (y) {
    return '<option value="' + y + '">' + y + (y === _currentYear ? ' (current)' : '') + '</option>';
  }).join('');
  if (selectValue) sel.value = selectValue;
}

// ── Boot ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  guardRoute('principal');
  loadTeachers();
  refreshCurrentYearLabel();
});
