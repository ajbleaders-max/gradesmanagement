/**
 * AJB Leaders Academy — API backend (v2)
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED FROM v1 (read this before touching sheets by hand):
 *
 * 1. STUDENTS is split into two kinds of data:
 *      - STUDENT_MASTER   : permanent identity (name, DOB, parent info…),
 *                           ONE row per student, forever.
 *      - ENROLL_<year>    : that student's Class + Status for a single
 *                           academic year (e.g. ENROLL_2025_2026).
 *    A student's row is never deleted when they leave — their Status
 *    changes to Withdrawn / Graduated / Transferred / Suspended instead.
 *
 * 2. GRADES is split per year too: GRADES_<year> (e.g. GRADES_2025_2026),
 *    each with its own AcademicYear column. This keeps every year's
 *    working sheet small and fast, and keeps grade history unambiguous.
 *
 * 3. USERS no longer stores plaintext passwords. It stores PasswordHash +
 *    Salt (SHA-256). Run migrateLegacySchema() once (see bottom of file)
 *    to convert an existing live sheet — it hashes existing passwords,
 *    splits STUDENTS/GRADES into the new per-year sheets, and renames the
 *    old sheets to *_LEGACY_BACKUP rather than deleting them.
 *
 * 4. Every request (except login) must carry a sessionToken, issued at
 *    login and checked server-side against a SESSIONS sheet. Role checks
 *    (principal vs teacher) are enforced here, from the validated session
 *    — never from whatever the client claims in the request body.
 *
 * SETTINGS!AcademicYear is treated as "the current year" — it decides
 * which ENROLL_/GRADES_ sheet most actions read/write by default.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ── Schema constants ─────────────────────────────────────────────────────

const ENROLL_HEADERS = ["StudentID", "Class", "Status", "AcademicYear"];
const GRADES_HEADERS = [
  "StudentID", "StudentName", "Class", "Subject", "Semester",
  "Period1", "Period2", "Period3", "Period4", "Period5", "Period6",
  "Exam", "Average", "Teacher", "AcademicYear",
];
const STUDENT_MASTER_HEADERS = [
  "StudentID", "FullName", "Gender", "DateOfBirth",
  "ParentName", "ParentPhone", "Address", "EnrollmentDate",
];
const SESSION_HEADERS = ["Token", "Username", "Role", "Status", "ExpiresAt"];
const STUDENT_STATUSES = ["Active", "Withdrawn", "Graduated", "Transferred", "Suspended"];
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours

// Which roles may call each action. 'public' = no session needed.
// 'any' = any signed-in, non-blocked user.
const ACTION_ROLES = {
  login: "public",
  logout: "any",
  getDashboard: ["principal"],
  getPrincipalProfile: ["principal"],
  listTeachers: ["principal"],
  addTeacher: ["principal"],
  updateTeacher: ["principal"],
  deleteTeacher: ["principal"],
  listStudents: ["principal"],
  getStudents: ["principal"], // legacy alias, kept for safety
  addStudent: ["principal"],
  updateStudent: ["principal"],
  deleteStudent: ["principal"],
  setStudentStatus: ["principal"],
  promoteStudents: ["principal"],
  createAcademicYear: ["principal"],
  listAcademicYears: ["principal"],
  getStudentProfile: ["principal", "teacher"],
  getTeacherData: ["teacher"],
  saveGrade: ["teacher", "principal"],
  saveStudentGrades: ["principal"],
  getGrades: ["principal", "teacher"],
  getSubjects: ["principal", "teacher"],
  generateReport: ["principal", "teacher"],
};

// ── Entry points ─────────────────────────────────────────────────────────

const API_VERSION = "v2.1-2026-07-09";

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, message: "AJB Leaders Academy API is running.", version: API_VERSION }),
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const action = String(e.parameter.action || "").trim();
    const data = e.parameter.payload ? JSON.parse(e.parameter.payload) : {};
    const requiredRoles = ACTION_ROLES[action];

    if (requiredRoles === undefined) {
      return jsonResponse(false, "Unknown action: " + action);
    }

    var session = null;
    if (requiredRoles !== "public") {
      const check = validateSession_(String(data.sessionToken || "").trim());
      if (!check.ok) {
        return jsonResponse(false, check.message || "Please log in again.", {
          sessionExpired: true,
        });
      }
      session = check;
      if (session.status === "blocked" || session.status === "inactive") {
        return jsonResponse(
          false,
          "Your account is " + session.status + ". Please contact your administrator.",
          { sessionExpired: true },
        );
      }
      if (requiredRoles !== "any" && requiredRoles.indexOf(session.role) === -1) {
        return jsonResponse(false, "You do not have permission to do that.");
      }
    }

    switch (action) {
      case "login": return loginUser(data);
      case "logout": return logoutUser(session);
      case "getDashboard": return getDashboardSummary(data, session);
      case "getPrincipalProfile": return getPrincipalProfile(data, session);
      case "listTeachers": return listTeachers();
      case "addTeacher": return addTeacher(data, session);
      case "updateTeacher": return updateTeacher(data, session);
      case "deleteTeacher": return deleteTeacher(data, session);
      case "listStudents": return listStudents(data, session);
      case "getStudents": return listStudents(data, session);
      case "addStudent": return addStudent(data, session);
      case "updateStudent": return updateStudent(data, session);
      case "deleteStudent": return deleteStudent(data, session);
      case "setStudentStatus": return setStudentStatus(data, session);
      case "promoteStudents": return promoteStudents(data, session);
      case "createAcademicYear": return createAcademicYear(data, session);
      case "listAcademicYears": return listAcademicYears();
      case "getStudentProfile": return getStudentProfile(data, session);
      case "getTeacherData": return getTeacherData(data, session);
      case "saveGrade": return saveGrade(data, session);
      case "saveStudentGrades": return saveStudentGrades(data, session);
      case "getGrades": return getGrades(data, session);
      case "getSubjects": return getSubjects();
      case "generateReport": return generateReport(data, session);
      default: return jsonResponse(false, "Unknown action: " + action);
    }
  } catch (error) {
    return jsonResponse(false, error.message || "Unexpected error.");
  }
}

// ── Auth: login / logout / sessions ─────────────────────────────────────

function loginUser(data) {
  const username = String(data.username || "").trim();
  const password = String(data.password || "").trim();
  if (!username || !password)
    return jsonResponse(false, "Username and password are required.");

  const sheet = ss_().getSheetByName("USERS");
  if (!sheet) return jsonResponse(false, "USERS sheet not found.");
  const rows = sheet.getDataRange().getValues();
  const headers = (rows.shift() || []).map(function (h) { return String(h).trim(); });
  const idx = function (name) { return headers.indexOf(name); };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[idx("Username")] || "").toLowerCase() !== username.toLowerCase()) continue;

    const status = String(row[idx("Status")] || "active").trim().toLowerCase();
    if (status === "blocked") {
      return jsonResponse(false, "Your account has been blocked. Please contact your administrator.");
    }

    const storedHash = String(row[idx("PasswordHash")] || "");
    const salt = String(row[idx("Salt")] || "");
    if (!storedHash) {
      return jsonResponse(false, "This account has no password set up yet. Contact your administrator.");
    }
    if (hashPassword_(password, salt) !== storedHash) {
      return jsonResponse(false, "Invalid credentials.");
    }

    const role = String(row[idx("Role")] || "teacher").trim().toLowerCase();
    purgeExpiredSessions_();
    const session = createSession_(username, role, status);
    return jsonResponse(true, "Login successful.", {
      role: role, status: status, username: username, token: session.token,
    });
  }
  return jsonResponse(false, "Invalid credentials.");
}

function logoutUser(session) {
  if (session && session.token) {
    const sheet = ss_().getSheetByName("SESSIONS");
    if (sheet) {
      const rows = sheet.getDataRange().getValues();
      const idx = findRowIndex(rows, "Token", session.token);
      if (idx >= 0) sheet.deleteRow(idx + 2);
    }
  }
  return jsonResponse(true, "Logged out.");
}

function createSession_(username, role, status) {
  const sheet = getOrCreateSheet_("SESSIONS", SESSION_HEADERS);
  const token = Utilities.getUuid();
  const expires = new Date(Date.now() + SESSION_LIFETIME_MS);
  sheet.appendRow([token, username, role, status, expires.toISOString()]);
  return { token: token, expires: expires };
}

// Returns { ok:true, token, username, role, status } or { ok:false, message, expired? }
function validateSession_(token) {
  if (!token) return { ok: false, message: "Please log in." };
  const sheet = ss_().getSheetByName("SESSIONS");
  if (!sheet) return { ok: false, message: "Please log in.", expired: true };

  const rows = sheet.getDataRange().getValues();
  const headers = (rows[0] || []).map(function (h) { return String(h).trim(); });
  const tCol = headers.indexOf("Token");
  const uCol = headers.indexOf("Username");
  const rCol = headers.indexOf("Role");
  const sCol = headers.indexOf("Status");
  const eCol = headers.indexOf("ExpiresAt");

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][tCol]) !== token) continue;
    const expiresAt = new Date(rows[i][eCol]);
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      sheet.deleteRow(i + 1);
      return { ok: false, message: "Your session expired. Please log in again.", expired: true };
    }
    return {
      ok: true,
      token: token,
      username: String(rows[i][uCol] || ""),
      role: String(rows[i][rCol] || "").trim().toLowerCase(),
      status: String(rows[i][sCol] || "active").trim().toLowerCase(),
    };
  }
  return { ok: false, message: "Session not found. Please log in again.", expired: true };
}

function purgeExpiredSessions_() {
  const sheet = ss_().getSheetByName("SESSIONS");
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return;
  const headers = rows[0].map(function (h) { return String(h).trim(); });
  const eCol = headers.indexOf("ExpiresAt");
  for (let i = rows.length - 1; i >= 1; i--) {
    const exp = new Date(rows[i][eCol]);
    if (isNaN(exp.getTime()) || exp.getTime() < Date.now()) sheet.deleteRow(i + 1);
  }
}

function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + String(salt));
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");
}

function generateSalt_() {
  return Utilities.getUuid();
}

// ── Sheet / schema helpers ───────────────────────────────────────────────

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(name, headers) {
  var sheet = ss_().getSheetByName(name);
  if (!sheet) {
    sheet = ss_().insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function getSettings_() {
  const sheet = ss_().getSheetByName("SETTINGS");
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return {};
  const headers = rows[0].map(function (h) { return String(h).trim(); });
  const obj = {};
  headers.forEach(function (h, i) { obj[h] = rows[1][i]; });
  return obj;
}

function getCurrentYear_() {
  return String(getSettings_().AcademicYear || "").trim();
}

function yearKey_(year) {
  return String(year || "").trim().replace(/[^0-9A-Za-z]+/g, "_").replace(/^_+|_+$/g, "");
}
function enrollSheetName_(year) { return "ENROLL_" + yearKey_(year); }
function gradesSheetName_(year) { return "GRADES_" + yearKey_(year); }

function getEnrollmentSheet_(year, createIfMissing) {
  const name = enrollSheetName_(year);
  var sheet = ss_().getSheetByName(name);
  if (!sheet && createIfMissing) sheet = getOrCreateSheet_(name, ENROLL_HEADERS);
  return sheet;
}
function getGradesSheetForYear_(year, createIfMissing) {
  const name = gradesSheetName_(year);
  var sheet = ss_().getSheetByName(name);
  if (!sheet && createIfMissing) sheet = getOrCreateSheet_(name, getGradesHeaderTemplate_());
  return sheet;
}

// New GRADES_<year> sheets copy whatever headers are actually in use, rather
// than a hardcoded guess — this keeps the schema correct even if it's
// different from what this file assumes (e.g. Sem1 AVG/Exam1/Exam2 style
// columns instead of a single Exam/Average column).
function getGradesHeaderTemplate_() {
  const current = ss_().getSheetByName(gradesSheetName_(getCurrentYear_()));
  if (current && current.getLastColumn() > 0) {
    const headers = current.getRange(1, 1, 1, current.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); }).filter(Boolean);
    if (headers.length) return ensureAcademicYearHeader_(headers);
  }
  var sheets = ss_().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (/^GRADES_/.test(sheets[i].getName()) && sheets[i].getLastColumn() > 0) {
      const headers = sheets[i].getRange(1, 1, 1, sheets[i].getLastColumn()).getValues()[0]
        .map(function (h) { return String(h).trim(); }).filter(Boolean);
      if (headers.length) return ensureAcademicYearHeader_(headers);
    }
  }
  const legacy = ss_().getSheetByName("GRADES");
  if (legacy && legacy.getLastColumn() > 0) {
    const headers = legacy.getRange(1, 1, 1, legacy.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); }).filter(Boolean);
    if (headers.length) return ensureAcademicYearHeader_(headers);
  }
  return GRADES_HEADERS.slice(); // last resort, brand-new install with no data anywhere
}

function ensureAcademicYearHeader_(headers) {
  const has = headers.some(function (h) { return h.toLowerCase().replace(/\s+/g, "") === "academicyear"; });
  return has ? headers : headers.concat(["AcademicYear"]);
}
function getStudentMasterSheet_(createIfMissing) {
  var sheet = ss_().getSheetByName("STUDENT_MASTER");
  if (!sheet && createIfMissing) sheet = getOrCreateSheet_("STUDENT_MASTER", STUDENT_MASTER_HEADERS);
  return sheet;
}

function findRowIndex(rows, key, value) {
  const headers = (rows[0] || []).map(function (name) { return String(name).trim(); });
  const col = headers.indexOf(key);
  if (col < 0) return -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][col] || "").toLowerCase() === String(value).toLowerCase()) return i - 1;
  }
  return -1;
}

function readSheetRowsFromSheet_(sheet) {
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const headers = (rows[0] || []).map(function (name) { return String(name).trim(); });
  return rows.slice(1).map(function (row) {
    const item = {};
    headers.forEach(function (name, index) { item[name] = row[index]; });
    return item;
  }).filter(function (item) {
    return Object.values(item).some(function (v) { return String(v || "").trim() !== ""; });
  });
}
function readSheetRows(sheetName) {
  return readSheetRowsFromSheet_(ss_().getSheetByName(sheetName));
}

// Merge STUDENT_MASTER (permanent identity) with a year's ENROLL_ sheet
// (Class/Status/AcademicYear) into flat objects, shaped like the old
// STUDENTS rows plus a Status field.
function getMergedStudents_(year) {
  const masterRows = readSheetRows("STUDENT_MASTER");
  const masterMap = {};
  masterRows.forEach(function (m) {
    masterMap[String(m.StudentID || "").trim().toLowerCase()] = m;
  });
  const enrollRows = readSheetRowsFromSheet_(getEnrollmentSheet_(year, false));
  return enrollRows.map(function (e) {
    const key = String(e.StudentID || "").trim().toLowerCase();
    return Object.assign({}, masterMap[key] || {}, e);
  });
}

// ── Students ─────────────────────────────────────────────────────────────

function listStudents(data, session) {
  const year = (data && data.academicYear) ? String(data.academicYear).trim() : getCurrentYear_();
  return jsonResponse(true, "Students loaded.", {
    students: getMergedStudents_(year),
    academicYear: year,
  });
}

function addStudent(data, session) {
  const studentID = String(data.studentID || data.studentId || "").trim();
  const fullName = String(data.fullName || "").trim();
  const gender = String(data.gender || "").trim();
  const classValue = String(data.className || data.studentClass || data.classValue || "").trim();
  const year = String(data.academicYear || "").trim() || getCurrentYear_();
  const dateOfBirth = String(data.dateOfBirth || data.studentDateOfBirth || "").trim();
  const parentName = String(data.parentName || data.studentParentName || "").trim();
  const parentPhone = String(data.parentPhone || "").trim();
  const address = String(data.address || "").trim();
  const enrollmentDate = String(data.enrollmentDate || data.studentEnrollmentDate || "").trim();

  if (!studentID || !fullName) return jsonResponse(false, "Student ID and full name are required.");
  if (!year) return jsonResponse(false, "No current academic year is set (SETTINGS!AcademicYear).");

  const masterSheet = getStudentMasterSheet_(true);
  const masterRows = masterSheet.getDataRange().getValues();
  if (findRowIndex(masterRows, "StudentID", studentID) < 0) {
    masterSheet.appendRow([studentID, fullName, gender, dateOfBirth, parentName, parentPhone, address, enrollmentDate]);
  }

  const enrollSheet = getEnrollmentSheet_(year, true);
  const enrollRows = enrollSheet.getDataRange().getValues();
  const already = enrollRows.slice(1).some(function (row) {
    return String(row[0] || "").toLowerCase() === studentID.toLowerCase();
  });
  if (already) return jsonResponse(false, "This student is already enrolled for " + year + ".");
  enrollSheet.appendRow([studentID, classValue, "Active", year]);

  return jsonResponse(true, "Student added successfully.", {
    student: { studentID: studentID, fullName: fullName, academicYear: year },
  });
}

function updateStudent(data, session) {
  if (!session || session.role !== "principal")
    return jsonResponse(false, "Only principals may update student profiles.");

  const studentID = String(data.studentID || data.studentId || "").trim();
  if (!studentID) return jsonResponse(false, "Student ID is required.");
  const year = String(data.academicYear || "").trim() || getCurrentYear_();

  const masterSheet = getStudentMasterSheet_(true);
  const masterRows = masterSheet.getDataRange().getValues();
  const mIdx = findRowIndex(masterRows, "StudentID", studentID);
  if (mIdx < 0) return jsonResponse(false, "Student not found.");
  const mHeaders = masterRows[0].map(function (h) { return String(h).trim(); });
  const mRow = masterRows[mIdx + 1];
  function setIfProvided(col, value) { if (value) mRow[mHeaders.indexOf(col)] = value; }
  setIfProvided("FullName", String(data.fullName || "").trim());
  setIfProvided("Gender", String(data.gender || "").trim());
  setIfProvided("DateOfBirth", String(data.dateOfBirth || data.studentDateOfBirth || "").trim());
  setIfProvided("ParentName", String(data.parentName || data.studentParentName || "").trim());
  setIfProvided("ParentPhone", String(data.parentPhone || "").trim());
  setIfProvided("Address", String(data.address || "").trim());
  setIfProvided("EnrollmentDate", String(data.enrollmentDate || data.studentEnrollmentDate || "").trim());
  masterSheet.getRange(mIdx + 2, 1, 1, mRow.length).setValues([mRow]);

  const fullName = String(data.fullName || "").trim();
  const classValue = String(data.className || data.studentClass || "").trim();

  if (classValue) {
    const enrollSheet = getEnrollmentSheet_(year, true);
    const eRows = enrollSheet.getDataRange().getValues();
    const eHeaders = eRows[0].map(function (h) { return String(h).trim(); });
    const eIdx = findRowIndex(eRows, "StudentID", studentID);
    if (eIdx >= 0) {
      enrollSheet.getRange(eIdx + 2, eHeaders.indexOf("Class") + 1).setValue(classValue);
    }
  }

  if (fullName || classValue) {
    const gradesSheet = getGradesSheetForYear_(year, false);
    if (gradesSheet) {
      const lastRow = gradesSheet.getLastRow();
      if (lastRow > 1) {
        const lastCol = gradesSheet.getLastColumn();
        const gRows = gradesSheet.getRange(1, 1, lastRow, lastCol).getValues();
        const gHeaders = gRows[0].map(function (h) { return String(h).trim().toLowerCase().replace(/\s+/g, ""); });
        const sidCol = gHeaders.indexOf("studentid");
        const nameCol = gHeaders.indexOf("studentname");
        const classCol = gHeaders.indexOf("class");
        if (sidCol >= 0) {
          for (var i = 1; i < gRows.length; i++) {
            if (String(gRows[i][sidCol] || "").trim().toLowerCase() === studentID.toLowerCase()) {
              if (fullName && nameCol >= 0) gradesSheet.getRange(i + 1, nameCol + 1).setValue(fullName);
              if (classValue && classCol >= 0) gradesSheet.getRange(i + 1, classCol + 1).setValue(classValue);
            }
          }
        }
      }
    }
  }

  return jsonResponse(true, "Student updated.");
}

// Change a student's status for a given year (Active/Withdrawn/Graduated/
// Transferred/Suspended). This is a soft change — the row is never removed,
// so the student still shows up in dashboards/history for that year.
function setStudentStatus(data, session) {
  if (!session || session.role !== "principal")
    return jsonResponse(false, "Only principals may change a student's status.");

  const studentID = String(data.studentID || data.studentId || "").trim();
  const status = String(data.status || "").trim();
  const year = String(data.academicYear || "").trim() || getCurrentYear_();

  if (!studentID) return jsonResponse(false, "Student ID is required.");
  if (STUDENT_STATUSES.indexOf(status) === -1)
    return jsonResponse(false, "Status must be one of: " + STUDENT_STATUSES.join(", "));

  const enrollSheet = getEnrollmentSheet_(year, false);
  if (!enrollSheet) return jsonResponse(false, "No enrollment records found for " + year + ".");
  const rows = enrollSheet.getDataRange().getValues();
  const idx = findRowIndex(rows, "StudentID", studentID);
  if (idx < 0) return jsonResponse(false, "Student is not enrolled for " + year + ".");
  const headers = rows[0].map(function (h) { return String(h).trim(); });
  enrollSheet.getRange(idx + 2, headers.indexOf("Status") + 1).setValue(status);

  return jsonResponse(true, "Student status set to " + status + " for " + year + ".");
}

// Kept for backward compatibility with the existing "Delete" button in the
// admin UI — it no longer deletes anything. It marks the student Withdrawn
// (or whatever status is passed) for the given year instead.
function deleteStudent(data, session) {
  const status = String(data.status || "").trim() || "Withdrawn";
  return setStudentStatus(Object.assign({}, data, { status: status }), session);
}

function promoteStudents(data, session) {
  if (!session || session.role !== "principal")
    return jsonResponse(false, "Only principals may promote students.");

  const fromYear = String(data.fromYear || "").trim() || getCurrentYear_();
  const toYear = String(data.toYear || "").trim();
  const classMap = data.classMap || {}; // optional { "Grade 3": "Grade 4" }
  if (!toYear) return jsonResponse(false, "Target academic year is required.");

  const fromEnroll = getEnrollmentSheet_(fromYear, false);
  if (!fromEnroll) return jsonResponse(false, "No enrollment records found for " + fromYear + ".");
  const active = readSheetRowsFromSheet_(fromEnroll).filter(function (r) {
    return String(r.Status || "").trim().toLowerCase() === "active";
  });

  const toEnroll = getEnrollmentSheet_(toYear, true);
  const existingIDs = {};
  toEnroll.getDataRange().getValues().slice(1).forEach(function (row) {
    existingIDs[String(row[0] || "").toLowerCase()] = true;
  });

  var promoted = 0, skipped = 0;
  active.forEach(function (s) {
    const sid = String(s.StudentID || "").trim();
    if (!sid || existingIDs[sid.toLowerCase()]) { skipped++; return; }
    const oldClass = String(s.Class || "").trim();
    const newClass = classMap[oldClass] || oldClass;
    toEnroll.appendRow([sid, newClass, "Active", toYear]);
    promoted++;
  });

  getGradesSheetForYear_(toYear, true); // fresh grades sheet for the new year

  return jsonResponse(
    true,
    "Promoted " + promoted + " student(s) to " + toYear +
      (skipped ? " (" + skipped + " already present, skipped)." : "."),
    { promoted: promoted, skipped: skipped },
  );
}

function createAcademicYear(data, session) {
  if (!session || session.role !== "principal")
    return jsonResponse(false, "Only principals may create a new academic year.");

  const year = String(data.year || "").trim();
  const makeCurrent = data.makeCurrent !== false;
  if (!year) return jsonResponse(false, "Academic year label is required, e.g. 2026-2027.");

  getEnrollmentSheet_(year, true);
  getGradesSheetForYear_(year, true);

  if (makeCurrent) {
    const settingsSheet = ss_().getSheetByName("SETTINGS");
    if (settingsSheet) {
      const rows = settingsSheet.getDataRange().getValues();
      if (rows.length >= 2) {
        const headers = rows[0].map(function (h) { return String(h).trim(); });
        const col = headers.indexOf("AcademicYear");
        if (col >= 0) settingsSheet.getRange(2, col + 1).setValue(year);
      }
    }
  }

  return jsonResponse(true, "Academic year " + year + " created" + (makeCurrent ? " and set as current." : "."));
}

function listAcademicYears() {
  const years = {};
  ss_().getSheets().forEach(function (sh) {
    const m = sh.getName().match(/^ENROLL_(.+)$/) || sh.getName().match(/^GRADES_(.+)$/);
    if (m) years[m[1]] = true;
  });
  return jsonResponse(true, "Academic years loaded.", {
    years: Object.keys(years),
    current: getCurrentYear_(),
  });
}

function getStudentProfile(data, session) {
  const studentID = String(data.studentID || data.studentId || "").trim();
  if (!studentID) return jsonResponse(false, "Student ID is required.");
  const year = String(data.academicYear || "").trim() || getCurrentYear_();

  const student = getMergedStudents_(year).find(function (s) {
    return String(s.StudentID || "").trim().toLowerCase() === studentID.toLowerCase();
  });
  if (!student) return jsonResponse(false, "Student not found for " + year + ".");

  if (session && session.role === "teacher") {
    const teacher = readSheetRows("USERS").find(function (u) {
      return String(u.Username || "").trim().toLowerCase() === session.username.toLowerCase();
    });
    const assignedClasses = teacher ? String(teacher.AssignedClasses || "ALL").trim() : "ALL";
    if (assignedClasses.toUpperCase() !== "ALL") {
      const allowed = assignedClasses.split(/\s*,\s*/).map(function (c) { return c.trim().toLowerCase(); }).filter(Boolean);
      const studentClass = String(student.Class || "").trim().toLowerCase();
      if (!studentClass || allowed.indexOf(studentClass) === -1) {
        return jsonResponse(false, "You are not assigned to this student's class.");
      }
    }
  }

  return jsonResponse(true, "Student profile loaded.", { student: student });
}

// ── Dashboard ────────────────────────────────────────────────────────────

function getDashboardSummary(data, session) {
  const year = (data && data.academicYear) ? String(data.academicYear).trim() : getCurrentYear_();
  const users = readSheetRows("USERS");
  const students = getMergedStudents_(year); // ALL statuses — nothing hidden here on purpose
  const grades = readSheetRowsFromSheet_(getGradesSheetForYear_(year, false));

  const principals = users.filter(function (u) { return String(u.Role || "").toLowerCase() === "principal"; });
  const teachers = users.filter(function (u) { return String(u.Role || "").toLowerCase() === "teacher"; });
  const classNames = students.map(function (s) { return String(s.Class || "").trim(); })
    .filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });

  return jsonResponse(true, "Dashboard loaded.", {
    academicYear: year,
    principals: principals.length,
    teachers: teachers.length,
    students: students.length,
    grades: grades.length,
    classes: classNames.length,
    recentTeachers: teachers.slice().reverse().slice(0, 5),
    recentStudents: students.slice().reverse().slice(0, 5),
    allStudents: students,
  });
}

// ── Teachers ─────────────────────────────────────────────────────────────

function addTeacher(data, session) {
  const username = String(data.username || "").trim();
  const password = String(data.password || "").trim();
  const fullName = String(data.fullName || "").trim();
  const assignedClasses = String(data.assignedClasses || "ALL").trim();
  const assignedSubjects = String(data.assignedSubjects || "ALL").trim();
  const phone = String(data.phone || "").trim();
  const status = String(data.status || "active").trim();
  const photoLink = String(data.photoLink || "").trim();

  if (!username || !password || !fullName)
    return jsonResponse(false, "Username, password, and full name are required.");

  const sheet = ss_().getSheetByName("USERS");
  if (!sheet) return jsonResponse(false, "USERS sheet not found.");
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(function (h) { return String(h).trim(); });
  const usernameCol = headers.indexOf("Username");

  const existing = rows.slice(1).some(function (row) {
    return String(row[usernameCol] || "").toLowerCase() === username.toLowerCase();
  });
  if (existing) return jsonResponse(false, "Teacher username already exists.");

  const idCol = headers.indexOf("ID");
  const nextId = rows.length > 1
    ? Math.max.apply(null, rows.slice(1).map(function (row) { return Number(row[idCol]) || 0; })) + 1
    : 1;

  const salt = generateSalt_();
  const hash = hashPassword_(password, salt);

  const newRow = new Array(headers.length).fill("");
  function set(col, val) { const i = headers.indexOf(col); if (i >= 0) newRow[i] = val; }
  set("ID", nextId);
  set("Role", "teacher");
  set("Username", username);
  set("PasswordHash", hash);
  set("Salt", salt);
  set("FullName", fullName);
  set("AssignedClasses", assignedClasses);
  set("AssignedSubjects", assignedSubjects);
  set("PhotoLink", photoLink);
  set("Status", status);
  set("Phone", phone);
  sheet.appendRow(newRow);

  return jsonResponse(true, "Teacher added successfully.", {
    teacher: { username: username, fullName: fullName, role: "teacher" },
  });
}

function listTeachers() {
  const teachers = readSheetRows("USERS")
    .filter(function (row) { return String(row.Role || "").toLowerCase() === "teacher"; })
    .map(scrubUser_);
  return jsonResponse(true, "Teachers loaded.", { teachers: teachers });
}

function scrubUser_(user) {
  const safe = Object.assign({}, user);
  delete safe.PasswordHash;
  delete safe.Salt;
  return safe;
}

function updateTeacher(data, session) {
  const username = String(data.username || "").trim();
  const fullName = String(data.fullName || "").trim();
  const password = String(data.password || "").trim();
  const assignedClasses = String(data.assignedClasses || "").trim();
  const assignedSubjects = String(data.assignedSubjects || "").trim();
  const phone = String(data.phone || "").trim();
  const status = String(data.status || "").trim();
  const photoLink = String(data.photoLink || "").trim();
  if (!username) return jsonResponse(false, "Teacher username is required.");

  const sheet = ss_().getSheetByName("USERS");
  if (!sheet) return jsonResponse(false, "USERS sheet not found.");
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(function (h) { return String(h).trim(); });
  const index = findRowIndex(rows, "Username", username);
  if (index < 0) return jsonResponse(false, "Teacher not found.");
  const row = rows[index + 1];
  function set(col, val) { const i = headers.indexOf(col); if (i >= 0) row[i] = val; }

  if (fullName) set("FullName", fullName);
  if (password) {
    const salt = generateSalt_();
    set("Salt", salt);
    set("PasswordHash", hashPassword_(password, salt));
  }
  if (assignedClasses) set("AssignedClasses", assignedClasses);
  if (assignedSubjects) set("AssignedSubjects", assignedSubjects);
  if (photoLink !== undefined && headers.indexOf("PhotoLink") >= 0) set("PhotoLink", photoLink);
  if (phone !== undefined && headers.indexOf("Phone") >= 0) set("Phone", phone);
  if (status) set("Status", status);

  sheet.getRange(index + 2, 1, 1, row.length).setValues([row]);
  return jsonResponse(true, "Teacher updated.");
}

function deleteTeacher(data, session) {
  const username = String(data.username || "").trim();
  if (!username) return jsonResponse(false, "Teacher username is required.");
  const sheet = ss_().getSheetByName("USERS");
  if (!sheet) return jsonResponse(false, "USERS sheet not found.");
  const rows = sheet.getDataRange().getValues();
  const index = findRowIndex(rows, "Username", username);
  if (index < 0) return jsonResponse(false, "Teacher not found.");
  sheet.deleteRow(index + 2);
  return jsonResponse(true, "Teacher deleted.");
}

function getPrincipalProfile(data, session) {
  const username = String(data.username || "").trim();
  if (!username) return jsonResponse(false, "Username is required.");
  const user = readSheetRows("USERS").find(function (row) {
    return String(row.Username || "").toLowerCase() === username.toLowerCase();
  });
  if (!user) return jsonResponse(false, "User not found.");
  return jsonResponse(true, "Profile loaded.", { user: scrubUser_(user) });
}

function getTeacherData(data, session) {
  const username = session.username;
  const teacher = readSheetRows("USERS").find(function (u) {
    return String(u.Username || "").toLowerCase() === username.toLowerCase();
  });
  if (!teacher) return jsonResponse(false, "Teacher not found.");

  const year = getCurrentYear_();
  const assignedClasses = String(teacher.AssignedClasses || "ALL").trim();
  const assignedSubjects = String(teacher.AssignedSubjects || "ALL").trim();
  const isAllClasses = assignedClasses.toUpperCase() === "ALL";
  const isAllSubjects = assignedSubjects.toUpperCase() === "ALL";
  const classList = assignedClasses.toLowerCase().split(",").map(function (c) { return c.trim(); });
  const subjectList = assignedSubjects.toLowerCase().split(",").map(function (s) { return s.trim(); });

  const allStudents = getMergedStudents_(year);
  const students = isAllClasses ? allStudents : allStudents.filter(function (s) {
    return classList.indexOf(String(s.Class || "").trim().toLowerCase()) !== -1;
  });

  const gradesSheet = getGradesSheetForYear_(year, false);
  const allGrades = readSheetRowsFromSheet_(gradesSheet);
  const grades = allGrades.filter(function (g) {
    const gradeClass = String(g.Class || "").trim().toLowerCase();
    const classAllowed = isAllClasses || classList.indexOf(gradeClass) !== -1;
    if (!classAllowed) return false;
    if (isAllSubjects) return true;
    return subjectList.indexOf(String(g.Subject || "").trim().toLowerCase()) !== -1;
  });

  var classSubjects = [];
  const subjSheet = ss_().getSheetByName("SUBJECTS");
  if (subjSheet && isAllSubjects) {
    const subjData = subjSheet.getDataRange().getValues();
    const subjHeaders = subjData[0].map(function (h) { return String(h).trim(); });
    var matchCols = [];
    if (isAllClasses) {
      for (var ci = 2; ci < subjHeaders.length; ci++) if (subjHeaders[ci]) matchCols.push(ci);
    } else {
      subjHeaders.forEach(function (h, ci) {
        var headerClasses = h.toLowerCase().split(",").map(function (x) { return x.trim(); });
        var matched = classList.some(function (tc) { return headerClasses.indexOf(tc) !== -1; });
        if (matched) matchCols.push(ci);
      });
    }
    var seen = {};
    for (var r = 1; r < subjData.length; r++) {
      matchCols.forEach(function (ci) {
        var val = String(subjData[r][ci] || "").trim();
        if (val && !seen[val.toLowerCase()]) { seen[val.toLowerCase()] = true; classSubjects.push(val); }
      });
    }
  }

  return jsonResponse(true, "Teacher data loaded.", {
    teacher: scrubUser_(teacher),
    students: students,
    grades: grades,
    classSubjects: classSubjects,
    gradeHeaders: gradesSheet
      ? gradesSheet.getRange(1, 1, 1, gradesSheet.getLastColumn()).getValues()[0]
          .map(function (h) { return String(h).trim(); }).filter(Boolean)
      : [],
  });
}

// ── Grades ───────────────────────────────────────────────────────────────

function getGrades(data, session) {
  const year = (data && data.academicYear) ? String(data.academicYear).trim() : getCurrentYear_();
  const sheet = getGradesSheetForYear_(year, false);
  if (!sheet) return jsonResponse(true, "Grades loaded.", { grades: [], academicYear: year });
  const rows = sheet.getDataRange().getValues();

  // The session's own identity always wins over anything the client claims.
  var teacherUsername = "";
  if (session && session.role === "teacher") {
    teacherUsername = session.username;
  } else if (data && data.teacherUsername) {
    teacherUsername = String(data.teacherUsername).trim();
  }

  if (!teacherUsername) {
    return jsonResponse(true, "Grades loaded.", { grades: rows, academicYear: year });
  }

  const teacher = readSheetRows("USERS").find(function (row) {
    return String(row.Username || "").trim().toLowerCase() === teacherUsername.toLowerCase();
  });
  if (!teacher) return jsonResponse(false, "Teacher not found.");

  const assignedClasses = String(teacher.AssignedClasses || "ALL").trim();
  const assignedSubjects = String(teacher.AssignedSubjects || "ALL").trim();
  const isAllClasses = assignedClasses.toUpperCase() === "ALL";
  const isAllSubjects = assignedSubjects.toUpperCase() === "ALL";
  const classList = assignedClasses.toLowerCase().split(",").map(function (c) { return c.trim(); });
  const subjectList = assignedSubjects.toLowerCase().split(",").map(function (s) { return s.trim(); });

  const headers = rows[0] || [];
  const classCol = headers.findIndex(function (h) { return String(h || "").trim().toLowerCase() === "class"; });
  const subjectCol = headers.findIndex(function (h) { return String(h || "").trim().toLowerCase() === "subject"; });

  const filteredRows = rows.filter(function (row, index) {
    if (index === 0) return true;
    const rowClass = classCol >= 0 ? String(row[classCol] || "").trim().toLowerCase() : "";
    const rowSubject = subjectCol >= 0 ? String(row[subjectCol] || "").trim().toLowerCase() : "";
    const classAllowed = isAllClasses || classList.indexOf(rowClass) !== -1;
    if (!classAllowed) return false;
    if (isAllSubjects) return true;
    return subjectList.indexOf(rowSubject) !== -1;
  });

  return jsonResponse(true, "Grades loaded.", { grades: filteredRows, academicYear: year });
}

function saveGrade(data, session) {
  const studentID = String(data.studentID || "").trim();
  const studentName = String(data.studentName || "").trim();
  const className = String(data.className || "").trim();
  const subject = String(data.subject || "").trim();
  const grades = data.grades || {};

  if (!studentID || !subject) return jsonResponse(false, "Student ID and subject are required.");

  if (session.role === "teacher") {
    const teacher = readSheetRows("USERS").find(function (u) {
      return String(u.Username || "").toLowerCase() === session.username.toLowerCase();
    });
    const tStatus = teacher ? String(teacher.Status || "active").trim().toLowerCase() : "active";
    if (tStatus === "inactive") return jsonResponse(false, "Your account is inactive. You cannot save grades.");
    if (tStatus === "blocked") return jsonResponse(false, "Your account has been blocked. You cannot save grades.");
  }

  const year = getCurrentYear_();
  const sheet = getGradesSheetForYear_(year, true);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const rows = lastRow >= 1 ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [GRADES_HEADERS];
  const headers = rows[0].map(function (h) { return String(h).trim(); });
  const normHeaders = headers.map(function (h) { return h.toLowerCase().replace(/\s+/g, ""); });

  function colIndex(name) { return normHeaders.indexOf(name.toLowerCase().replace(/\s+/g, "")); }
  function normSubject(s) {
    return String(s || "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  }

  const sidColEarly = normHeaders.indexOf("studentid");
  const subjColEarly = normHeaders.indexOf("subject");
  let rowIndex = -1;
  const incomingSID = studentID.toLowerCase();
  const incomingSubj = normSubject(subject);

  for (let i = 1; i < rows.length; i++) {
    const rowSID = String(rows[i][sidColEarly] !== undefined ? rows[i][sidColEarly] : "").trim().toLowerCase();
    const rowSubj = normSubject(rows[i][subjColEarly]);
    if (!rowSID && !rowSubj) continue;
    if (rowSID === incomingSID && rowSubj === incomingSubj) { rowIndex = i; break; }
  }

  if (rowIndex === -1) {
    const newRow = new Array(headers.length).fill("");
    const sidCI = colIndex("StudentID"); if (sidCI >= 0) newRow[sidCI] = studentID;
    const snCI = colIndex("StudentName"); if (snCI >= 0) newRow[snCI] = studentName;
    const clCI = colIndex("Class"); if (clCI >= 0) newRow[clCI] = className;
    const subCI = colIndex("Subject"); if (subCI >= 0) newRow[subCI] = subject;
    const ayCI = colIndex("AcademicYear"); if (ayCI >= 0) newRow[ayCI] = year;
    Object.keys(grades).forEach(function (col) {
      const ci = colIndex(col);
      if (ci >= 0) newRow[ci] = grades[col];
    });
    sheet.getRange(Math.max(lastRow, 1) + 1, 1, 1, newRow.length).setValues([newRow]);
  } else {
    const row = rows[rowIndex];
    let skipped = [];
    Object.keys(grades).forEach(function (col) {
      const ci = colIndex(col);
      if (ci < 0) return;
      const cellVal = row[ci];
      const existing = cellVal !== null && cellVal !== undefined ? String(cellVal).trim() : "";
      if (existing === "" || existing === "—") {
        sheet.getRange(rowIndex + 1, ci + 1).setValue(grades[col]);
      } else {
        skipped.push(col);
      }
    });
    if (skipped.length > 0) {
      return jsonResponse(
        false,
        "These period(s) already have grades and cannot be overwritten: " + skipped.join(", ") +
          ". If this is wrong, please check the GRADES_" + yearKey_(year) + " sheet directly.",
      );
    }
  }

  return jsonResponse(true, "Grade saved successfully.");
}

function saveStudentGrades(data, session) {
  const studentID = String(data.studentID || "").trim();
  const className = String(data.className || "").trim();
  const grades = data.grades || [];
  const overwrite = data.overwrite === true;

  if (!studentID) return jsonResponse(false, "Student ID is required.");
  if (!Array.isArray(grades) || grades.length === 0) return jsonResponse(false, "No grades to save.");

  const year = getCurrentYear_();
  const sheet = getGradesSheetForYear_(year, true);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const rows = lastRow >= 1 ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [GRADES_HEADERS];
  const headers = rows[0].map(function (h) { return String(h).trim(); });
  const normHeaders = headers.map(function (h) { return h.toLowerCase().replace(/\s+/g, ""); });
  function colIndex(name) { return normHeaders.indexOf(name.toLowerCase().replace(/\s+/g, "")); }

  const sidCol = colIndex("studentid");
  const subjCol = colIndex("subject");
  const classCol = colIndex("class");
  const ayCol = colIndex("academicyear");
  if (sidCol < 0 || subjCol < 0) return jsonResponse(false, "GRADES sheet is missing required columns.");

  var lastRowPointer = Math.max(lastRow, 1);
  var updatedCount = 0;
  grades.forEach(function (item) {
    const subject = String(item.subject || "").trim();
    if (!subject) return;
    var rowIndex = -1;
    for (var i = 1; i < rows.length; i++) {
      var rowSID = String(rows[i][sidCol] || "").trim().toLowerCase();
      var rowSubject = String(rows[i][subjCol] || "").trim().toLowerCase();
      if (rowSID === studentID.toLowerCase() && rowSubject === subject.toLowerCase()) { rowIndex = i; break; }
    }

    if (rowIndex === -1) {
      var newRow = new Array(headers.length).fill("");
      if (sidCol >= 0) newRow[sidCol] = studentID;
      if (subjCol >= 0) newRow[subjCol] = subject;
      if (classCol >= 0) newRow[classCol] = className;
      if (ayCol >= 0) newRow[ayCol] = year;
      Object.keys(item.values || {}).forEach(function (colName) {
        var ci = colIndex(colName);
        if (ci >= 0) newRow[ci] = item.values[colName];
      });
      sheet.getRange(lastRowPointer + 1, 1, 1, newRow.length).setValues([newRow]);
      lastRowPointer++;
      rows.push(newRow);
      updatedCount++;
    } else {
      var row = rows[rowIndex];
      Object.keys(item.values || {}).forEach(function (colName) {
        var ci = colIndex(colName);
        if (ci < 0) return;
        var value = item.values[colName];
        if (overwrite || String(row[ci] || "").trim() === "") {
          sheet.getRange(rowIndex + 1, ci + 1).setValue(value);
          updatedCount++;
        }
      });
    }
  });

  return jsonResponse(true, "Student grades saved.", { updated: updatedCount });
}

function generateReport(data, session) {
  return jsonResponse(true, "Report generation ready.", {
    studentID: data.studentID || data.studentId || "",
  });
}

function getSubjects() {
  const sheet = ss_().getSheetByName("SUBJECTS");
  if (!sheet) return jsonResponse(false, "SUBJECTS sheet not found.");
  const data = sheet.getDataRange().getValues();
  if (!data.length) return jsonResponse(true, "No subjects found.", { subjectsByClass: {} });

  const headers = data[0].map(function (h) { return String(h).trim(); });
  var subjectsByClass = {};
  for (var ci = 2; ci < headers.length; ci++) {
    var classHeader = headers[ci];
    if (!classHeader) continue;
    var classKeys = classHeader.split(",").map(function (c) { return c.trim(); });
    classKeys.forEach(function (cls) {
      if (!cls) return;
      var key = cls.toLowerCase();
      if (!subjectsByClass[key]) subjectsByClass[key] = [];
      for (var ri = 1; ri < data.length; ri++) {
        var val = String(data[ri][ci] || "").trim();
        if (val && subjectsByClass[key].indexOf(val) === -1) subjectsByClass[key].push(val);
      }
    });
  }
  return jsonResponse(true, "Subjects loaded.", { subjectsByClass: subjectsByClass });
}

function jsonResponse(ok, message, extra) {
  return ContentService.createTextOutput(
    JSON.stringify(Object.assign({ ok: ok, message: message }, extra || {})),
  ).setMimeType(ContentService.MimeType.JSON);
}

// ── ONE-TIME MIGRATION ───────────────────────────────────────────────────
// Run this once, manually, from the Apps Script editor (select
// migrateLegacySchema from the function dropdown, then Run). It:
//   1. Hashes existing plaintext USERS passwords into PasswordHash + Salt.
//   2. Splits the old STUDENTS sheet into STUDENT_MASTER + ENROLL_<year>.
//   3. Splits the old GRADES sheet into GRADES_<year> (adds AcademicYear).
//   4. Renames the old STUDENTS/GRADES sheets to *_LEGACY_BACKUP — nothing
//      is deleted, so you can always go back and double-check the source.
// It is safe to re-run: it skips students/rows it has already migrated.
// Check the Apps Script execution log (View > Logs) for a full report.
function migrateLegacySchema() {
  const ss = ss_();
  const log = [];
  const year = getCurrentYear_() || "Unknown_Year";
  log.push("Using current academic year from SETTINGS: " + year);

  // Create SESSIONS up front so it always exists even if something below fails.
  getOrCreateSheet_("SESSIONS", SESSION_HEADERS);
  log.push("Ensured SESSIONS sheet exists.");

  // 1. USERS password hashing (batched: one read, one write)
  const usersSheet = ss.getSheetByName("USERS");
  if (usersSheet) {
    const rows = usersSheet.getDataRange().getValues();
    var headers = rows[0].map(function (h) { return String(h).trim(); });
    var pwCol = headers.indexOf("Password");
    if (pwCol >= 0) {
      if (headers.indexOf("PasswordHash") === -1) headers.push("PasswordHash");
      if (headers.indexOf("Salt") === -1) headers.push("Salt");
      const hashCol = headers.indexOf("PasswordHash");
      const saltCol = headers.indexOf("Salt");

      var migratedCount = 0;
      const outRows = rows.slice(1).map(function (row) {
        const newRow = row.slice();
        while (newRow.length < headers.length) newRow.push("");
        const plain = String(row[pwCol] || "");
        const alreadyHashed = String(newRow[hashCol] || "");
        if (plain && !alreadyHashed) {
          const salt = generateSalt_();
          newRow[hashCol] = hashPassword_(plain, salt);
          newRow[saltCol] = salt;
          newRow[pwCol] = "(migrated - see PasswordHash)";
          migratedCount++;
        }
        return newRow;
      });

      usersSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      if (outRows.length) usersSheet.getRange(2, 1, outRows.length, headers.length).setValues(outRows);
      log.push("USERS: hashed " + migratedCount + " plaintext password(s).");
    } else {
      log.push("USERS: no plaintext Password column found — nothing to migrate.");
    }
  } else {
    log.push("USERS sheet not found — skipped.");
  }

  // 2. STUDENTS -> STUDENT_MASTER + ENROLL_<year> (batched)
  const studentsSheet = ss.getSheetByName("STUDENTS");
  if (studentsSheet) {
    const legacyStudents = readSheetRowsFromSheet_(studentsSheet);
    const masterSheet = getStudentMasterSheet_(true);
    const masterExisting = {};
    readSheetRows("STUDENT_MASTER").forEach(function (m) {
      masterExisting[String(m.StudentID || "").toLowerCase()] = true;
    });

    const newMasterRows = [];
    const enrollByYear = {};
    legacyStudents.forEach(function (s) {
      const sid = String(s.StudentID || "").trim();
      if (!sid) return;
      const sYear = String(s.AcademicYear || "").trim() || year;
      if (!masterExisting[sid.toLowerCase()]) {
        newMasterRows.push([
          sid, s.FullName || "", s.Gender || "", s.DateOfBirth || "",
          s.ParentName || "", s.ParentPhone || "", s.Address || "", s.EnrollmentDate || "",
        ]);
        masterExisting[sid.toLowerCase()] = true;
      }
      if (!enrollByYear[sYear]) enrollByYear[sYear] = [];
      enrollByYear[sYear].push([sid, s.Class || "", "Active", sYear]);
    });

    if (newMasterRows.length) {
      const startRow = masterSheet.getLastRow() + 1;
      masterSheet.getRange(startRow, 1, newMasterRows.length, STUDENT_MASTER_HEADERS.length).setValues(newMasterRows);
    }
    log.push("STUDENT_MASTER: added " + newMasterRows.length + " permanent student record(s).");

    Object.keys(enrollByYear).forEach(function (y) {
      const enrollSheet = getEnrollmentSheet_(y, true);
      const already = {};
      enrollSheet.getDataRange().getValues().slice(1).forEach(function (r) {
        already[String(r[0] || "").toLowerCase()] = true;
      });
      const rowsToAdd = enrollByYear[y].filter(function (r) { return !already[String(r[0]).toLowerCase()]; });
      if (rowsToAdd.length) {
        const startRow = enrollSheet.getLastRow() + 1;
        enrollSheet.getRange(startRow, 1, rowsToAdd.length, ENROLL_HEADERS.length).setValues(rowsToAdd);
      }
      log.push("Enrollment for " + y + ": added " + rowsToAdd.length + " student(s).");
    });

    studentsSheet.setName("STUDENTS_LEGACY_BACKUP");
    log.push("Renamed old STUDENTS sheet to STUDENTS_LEGACY_BACKUP.");
  } else {
    log.push("Legacy STUDENTS sheet not found — skipped.");
  }

  // 3. GRADES -> GRADES_<year> (batched, and headers copied VERBATIM from
  //    your real live sheet — no guessing at column names, so nothing is
  //    silently dropped even if your schema differs from the default).
  const gradesSheet = ss.getSheetByName("GRADES");
  if (gradesSheet) {
    const oldRows = gradesSheet.getDataRange().getValues();
    const oldHeaders = oldRows[0].map(function (h) { return String(h).trim(); }).filter(Boolean);
    const newHeaders = ensureAcademicYearHeader_(oldHeaders);
    const newGradesSheet = getOrCreateSheet_(gradesSheetName_(year), newHeaders);
    const actualHeaders = newGradesSheet.getRange(1, 1, 1, newGradesSheet.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    const ayCol = actualHeaders.indexOf("AcademicYear");

    const outRows = [];
    for (var i = 1; i < oldRows.length; i++) {
      const oldRow = oldRows[i];
      if (oldRow.every(function (c) { return String(c || "").trim() === ""; })) continue;
      const newRow = new Array(actualHeaders.length).fill("");
      oldHeaders.forEach(function (h, idx) {
        const ci = actualHeaders.indexOf(h);
        if (ci >= 0) newRow[ci] = oldRow[idx];
      });
      if (ayCol >= 0 && !newRow[ayCol]) newRow[ayCol] = year;
      outRows.push(newRow);
    }
    if (outRows.length) {
      const startRow = newGradesSheet.getLastRow() + 1;
      newGradesSheet.getRange(startRow, 1, outRows.length, actualHeaders.length).setValues(outRows);
    }

    gradesSheet.setName("GRADES_LEGACY_BACKUP");
    log.push("Migrated " + outRows.length + " grade row(s) into " + gradesSheetName_(year) +
      " (headers copied verbatim: " + actualHeaders.join(", ") + ") and renamed old sheet to GRADES_LEGACY_BACKUP.");
  } else {
    log.push("Legacy GRADES sheet not found — skipped.");
  }

  const report = log.join("\n");
  Logger.log(report);
  return report;
}
