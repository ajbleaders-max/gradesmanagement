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

// ── State ─────────────────────────────────────────────────────────────────

var _allStudents = [];
var _pendingDeleteID = '';
var STUDENT_PAGE = 5;

// ── Load & render ─────────────────────────────────────────────────────────

async function loadStudents() {
  var list = document.getElementById('studentManageList');
  list.innerHTML = '<div class="state-msg info"><span>⏳</span><span>Loading students…</span></div>';
  try {
    var result = await apiRequest('listStudents');
    if (!result || !result.ok) {
      list.innerHTML = '<div class="state-msg warn"><span>⚠️</span><span>' + (result && result.message ? result.message : 'Unable to load students.') + '</span></div>';
      return;
    }
    _allStudents = (result.students || []).slice().reverse();
    populateClassFilter();
    filterStudents();
  } catch(e) {
    list.innerHTML = '<div class="state-msg warn"><span>⚠️</span><span>Could not load students.</span></div>';
  }
}

function populateClassFilter() {
  var sel = document.getElementById('studentClassFilter');
  if (!sel) return;
  var classes = [];
  _allStudents.forEach(function(s) {
    var c = String(s.Class || s.Grade || '').trim();
    if (c && classes.indexOf(c) === -1) classes.push(c);
  });
  classes.sort();
  sel.innerHTML = '<option value="">All Classes</option>';
  classes.forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

function statusBadgeClass(status) {
  var s = String(status || 'active').toLowerCase();
  if (s === 'active') return 'stag stag-green';
  if (s === 'graduated') return 'stag stag-blue';
  return 'stag stag-amber'; // withdrawn / transferred / suspended
}

function buildStudentRow(s, i) {
  var name   = String(s.FullName || s.StudentName || 'Student').trim();
  var id     = String(s.StudentID || '').trim();
  var cls    = String(s.Class || s.Grade || '').trim();
  var gender = String(s.Gender || '').trim();
  var year   = String(s.AcademicYear || '').trim();
  var status = String(s.Status || 'Active').trim();

  return '<div class="student-row">' +
    '<div class="s-avatar ' + avClass(i) + '">' + initials(name) + '</div>' +
    '<div class="s-info">' +
      '<div class="s-name">' + name + '</div>' +
      '<div class="s-meta">ID: ' + (id || '—') + (gender ? ' · ' + gender : '') + '</div>' +
      '<div class="s-tags">' +
        (cls  ? '<span class="stag stag-blue">'   + cls  + '</span>' : '') +
        (year ? '<span class="stag stag-purple">' + year + '</span>' : '') +
        '<span class="' + statusBadgeClass(status) + '">' + status + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="s-actions">' +
      '<button class="act-btn act-edit" onclick="openStudentProfile(\'' + id.replace(/'/g,"\\'") + '\')">👁️ Profile</button>' +
      '<button class="act-btn act-edit" onclick="openStudentEdit(\'' + id.replace(/'/g,"\\'") + '\')">✏️ Edit</button>' +
      '<button class="act-btn act-delete" onclick="openDeleteStudentModal(\'' + id.replace(/'/g,"\\'") + '\',\'' + name.replace(/'/g,"\\'") + '\',\'' + status.replace(/'/g,"\\'") + '\')">🔖 Status</button>' +
    '</div>' +
  '</div>';
}

function renderStudents(students, showAll) {
  var list = document.getElementById('studentManageList');
  var countEl = document.getElementById('studentCountLabel');

  if (!students.length) {
    list.innerHTML = '<div class="state-msg info"><span>📭</span><span>No students found.</span></div>';
    if (countEl) countEl.textContent = '';
    return;
  }

  var visible = showAll ? students : students.slice(0, STUDENT_PAGE);
  list.innerHTML = visible.map(function(s, i) { return buildStudentRow(s, i); }).join('');

  if (countEl) {
    if (showAll || visible.length === students.length) {
      countEl.textContent = 'All ' + students.length + ' student' + (students.length !== 1 ? 's' : '');
    } else {
      countEl.textContent = 'Showing ' + visible.length + ' of ' + students.length + ' · Select a class to see all';
    }
  }
}

function filterStudents() {
  var q   = document.getElementById('studentSearch').value.toLowerCase().trim();
  var cls = document.getElementById('studentClassFilter') ? document.getElementById('studentClassFilter').value : '';

  var filtered = _allStudents.filter(function(s) {
    var matchQ = !q ||
      (s.FullName || '').toLowerCase().includes(q) ||
      (s.StudentName || '').toLowerCase().includes(q) ||
      (s.StudentID || '').toLowerCase().includes(q);
    var matchCls = !cls || String(s.Class || s.Grade || '').trim() === cls;
    return matchQ && matchCls;
  });

  // Show all when a class is selected or search is active, else cap at 5
  var showAll = !!(q || cls);
  renderStudents(filtered, showAll);
}

// ── Add student ───────────────────────────────────────────────────────────

window.submitAddStudent = async function() {
  var studentId        = document.getElementById('studentId').value.trim();
  var fullName         = document.getElementById('studentFullName').value.trim();
  var gender           = document.getElementById('studentGender').value;
  var className        = document.getElementById('studentClass').value;
  var academicYear     = document.getElementById('studentYear').value.trim();
  var dateOfBirth      = document.getElementById('studentDateOfBirth').value;
  var parentName       = document.getElementById('studentParentName').value.trim();
  var parentPhone      = document.getElementById('studentParentPhone').value.trim();
  var address          = document.getElementById('studentAddress').value.trim();
  var enrollmentDate   = document.getElementById('studentEnrollmentDate').value;
  var msg              = document.getElementById('studentMessage');

  if (!studentId || !fullName || !gender || !className) {
    msg.style.color = '#f87171';
    msg.textContent = 'Student ID, name, gender, and class are required.';
    return;
  }
  msg.style.color = '#64748b';
  msg.textContent = 'Adding student…';
  var btn = document.getElementById('addStudentBtn');
  btn.disabled = true;

  var result = await apiRequest('addStudent', {
    studentID: studentId,
    fullName,
    gender,
    className,
    studentClass: className,
    academicYear,
    dateOfBirth,
    parentName,
    parentPhone,
    address,
    enrollmentDate,
  });
  btn.disabled = false;
  if (result && result.ok) {
    msg.style.color = '#4ade80';
    msg.textContent = 'Student added successfully.';
    document.getElementById('studentId').value       = '';
    document.getElementById('studentFullName').value = '';
    document.getElementById('studentGender').value   = '';
    document.getElementById('studentClass').value    = '';
    document.getElementById('studentYear').value     = '';
    document.getElementById('studentDateOfBirth').value = '';
    document.getElementById('studentParentName').value = '';
    document.getElementById('studentParentPhone').value = '';
    document.getElementById('studentAddress').value = '';
    document.getElementById('studentEnrollmentDate').value = '';
    showToast('Student added successfully.', 'ok');
    await loadStudents();
  } else {
    msg.style.color = '#f87171';
    msg.textContent = result && result.message ? result.message : 'Could not add student.';
    showToast('Failed to add student.', 'err');
  }
};

// ── Edit modal ────────────────────────────────────────────────────────────

function normalizeDateValue(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  var raw = String(value || '').trim();
  if (!raw) return '';
  var isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/);
  if (isoMatch) return isoMatch[1];
  var d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

window.openStudentEdit = function(studentID) {
  var student = _allStudents.find(function(s) {
    return String(s.StudentID || '').toLowerCase() === String(studentID).toLowerCase();
  });
  if (!student) return;
  var name = String(student.FullName || student.StudentName || 'Student').trim();
  document.getElementById('editStudentID').value             = student.StudentID || '';
  document.getElementById('editStudentIDDisplay').value      = student.StudentID || '';
  document.getElementById('editStudentFullName').value       = name;
  document.getElementById('editStudentGender').value         = student.Gender || '';
  document.getElementById('editStudentClass').value          = student.Class || student.Grade || '';
  document.getElementById('editStudentYear').value           = student.AcademicYear || '';
  document.getElementById('editStudentDateOfBirth').value    = normalizeDateValue(student.DateOfBirth || student['Date Of Birth'] || student['Date of Birth'] || '');
  document.getElementById('editStudentParentName').value     = student.ParentName || student.StudentParentName || '';
  document.getElementById('editStudentParentPhone').value    = student.ParentPhone || '';
  document.getElementById('editStudentAddress').value        = student.Address || '';
  document.getElementById('editStudentEnrollmentDate').value = normalizeDateValue(student.EnrollmentDate || student['Enrollment Date'] || '');
  document.getElementById('editStudentMessage').textContent  = '';
  document.getElementById('editStudentModalSub').textContent = 'Editing: ' + name;
  document.getElementById('editStudentModal').classList.add('open');
};

window.closeStudentModal = function() {
  document.getElementById('editStudentModal').classList.remove('open');
};

window.saveStudentEdit = async function() {
  var studentID         = document.getElementById('editStudentID').value.trim();
  var fullName          = document.getElementById('editStudentFullName').value.trim();
  var gender            = document.getElementById('editStudentGender').value;
  var className         = document.getElementById('editStudentClass').value;
  var academicYear      = document.getElementById('editStudentYear').value.trim();
  var dateOfBirth       = document.getElementById('editStudentDateOfBirth').value;
  var parentName        = document.getElementById('editStudentParentName').value.trim();
  var parentPhone       = document.getElementById('editStudentParentPhone').value.trim();
  var address           = document.getElementById('editStudentAddress').value.trim();
  var enrollmentDate    = document.getElementById('editStudentEnrollmentDate').value;
  var msg               = document.getElementById('editStudentMessage');

  msg.textContent = 'Saving changes…';
  var session = getSession() || {};
  var result = await apiRequest('updateStudent', {
    studentID,
    fullName,
    gender,
    className,
    studentClass: className,
    academicYear,
    dateOfBirth,
    parentName,
    parentPhone,
    address,
    enrollmentDate,
    requesterRole: session.role || '',
  });
  if (result && result.ok) {
    closeStudentModal();
    showToast('Student updated successfully.', 'ok');
    await loadStudents();
  } else {
    msg.style.color = '#f87171';
    msg.textContent = result && result.message ? result.message : 'Update failed.';
  }
};

// ── Delete confirm modal ──────────────────────────────────────────────────

window.openStudentProfile = function(studentID) {
  if (!studentID) return;
  window.location.href = 'student_profile.html?studentID=' + encodeURIComponent(studentID);
};

window.openDeleteStudentModal = function(studentID, name, currentStatus) {
  _pendingDeleteID = studentID;
  document.getElementById('deleteStudentName').textContent = name || studentID;
  var sel = document.getElementById('statusChangeSelect');
  if (sel) sel.value = currentStatus || 'Active';
  document.getElementById('deleteStudentModal').classList.add('open');
};

window.closeDeleteStudentModal = function() {
  document.getElementById('deleteStudentModal').classList.remove('open');
  _pendingDeleteID = '';
};

window.confirmDeleteStudent = async function() {
  if (!_pendingDeleteID) return;
  var studentID = _pendingDeleteID;
  var status = (document.getElementById('statusChangeSelect') || {}).value || 'Withdrawn';
  closeDeleteStudentModal();
  var result = await apiRequest('setStudentStatus', { studentID: studentID, status: status });
  if (result && result.ok) {
    showToast('Status set to ' + status + '.', 'ok');
  } else {
    showToast((result && result.message) || 'Could not update status.', 'err');
  }
  await loadStudents();
};

// ── Academic year actions ─────────────────────────────────────────────────

window.promptCreateYear = async function() {
  var year = window.prompt('New academic year label (e.g. 2026-2027):');
  if (!year) return;
  var msg = document.getElementById('yearActionMessage');
  msg.textContent = 'Creating ' + year + '…';
  var result = await apiRequest('createAcademicYear', { year: year.trim(), makeCurrent: true });
  if (result && result.ok) {
    msg.style.color = '#4ade80';
    msg.textContent = result.message;
    showToast('Academic year ' + year + ' created.', 'ok');
    await refreshCurrentYearLabel();
  } else {
    msg.style.color = '#f87171';
    msg.textContent = (result && result.message) || 'Could not create academic year.';
  }
};

window.promptPromoteStudents = async function() {
  var toYear = window.prompt('Promote all Active students to which academic year? (e.g. 2026-2027)\nMake sure this year exists first (use "Start New Academic Year" if not).');
  if (!toYear) return;
  var msg = document.getElementById('yearActionMessage');
  msg.textContent = 'Promoting students to ' + toYear + '…';
  var result = await apiRequest('promoteStudents', { toYear: toYear.trim() });
  if (result && result.ok) {
    msg.style.color = '#4ade80';
    msg.textContent = result.message;
    showToast(result.message, 'ok');
  } else {
    msg.style.color = '#f87171';
    msg.textContent = (result && result.message) || 'Could not promote students.';
  }
};

async function refreshCurrentYearLabel() {
  var el = document.getElementById('currentYearLabel');
  if (!el) return;
  try {
    var result = await apiRequest('listAcademicYears');
    if (result && result.ok) el.textContent = result.current || '—';
  } catch (e) { /* non-fatal */ }
}

// ── Boot ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  guardRoute('principal');
  loadStudents();
  refreshCurrentYearLabel();
});