function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      ok: true,
      message: "AJB Leaders Academy API is running.",
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const action = String(e.parameter.action || "").trim();
    const data = e.parameter.payload ? JSON.parse(e.parameter.payload) : {};

    switch (action) {
      case "login":
        return loginUser(data);
      case "getStudents":
        return getStudents();
      case "getGrades":
        return getGrades();
      case "getDashboard":
        return getDashboardSummary();
      case "addTeacher":
        return addTeacher(data);
      case "addStudent":
        return addStudent(data);
      case "listTeachers":
        return listTeachers();
      case "listStudents":
        return listStudents();
      case "updateTeacher":
        return updateTeacher(data);
      case "deleteTeacher":
        return deleteTeacher(data);
      case "updateStudent":
        return updateStudent(data);
      case "deleteStudent":
        return deleteStudent(data);
      case "getTeacherData":
        return getTeacherData(data);
      case "saveGrade":
        return saveGrade(data);
      case "getPrincipalProfile":
        return getPrincipalProfile(data);
      case "generateReport":
        return generateReport(data);
      case "getSubjects":
        return getSubjects();
      default:
        return jsonResponse(false, "Unknown action: " + action);
    }
  } catch (error) {
    return jsonResponse(false, error.message || "Unexpected error.");
  }
}

function loginUser(data) {
  const username = String(data.username || "").trim();
  const password = String(data.password || "").trim();
  if (!username || !password)
    return jsonResponse(false, "Username and password are required.");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("USERS");
  if (!sheet) return jsonResponse(false, "USERS sheet not found.");
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift() || [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const user = {};
    headers.forEach(function (name, index) {
      user[String(name).trim()] = row[index];
    });
    if (
      String(user.Username || "").toLowerCase() === username.toLowerCase() &&
      String(user.Password || "") === password
    ) {
      var userStatus = String(user.Status || "active")
        .trim()
        .toLowerCase();
      if (userStatus === "blocked") {
        return jsonResponse(
          false,
          "Your account has been blocked. Please contact your administrator.",
        );
      }
      return jsonResponse(true, "Login successful.", {
        role: user.Role || "teacher",
        status: userStatus,
      });
    }
  }
  return jsonResponse(false, "Invalid credentials.");
}

function addStudent(data) {
  const studentID = String(data.studentID || data.studentId || "").trim();
  const fullName = String(data.fullName || "").trim();
  const gender = String(data.gender || "").trim();
  const classValue = String(
    data.className || data.studentClass || data.classValue || "",
  ).trim();
  const academicYear = String(data.academicYear || "").trim();

  if (!studentID || !fullName) {
    return jsonResponse(false, "Student ID and full name are required.");
  }

  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("STUDENTS");
  if (!sheet) return jsonResponse(false, "STUDENTS sheet not found.");

  const rows = sheet.getDataRange().getValues();
  const existing = rows.slice(1).some(function (row) {
    return String(row[0] || "").toLowerCase() === studentID.toLowerCase();
  });
  if (existing) return jsonResponse(false, "Student ID already exists.");

  sheet.appendRow([studentID, fullName, gender, classValue, academicYear]);
  return jsonResponse(true, "Student added successfully.", {
    student: { studentID, fullName },
  });
}

function addTeacher(data) {
  const username = String(data.username || "").trim();
  const password = String(data.password || "").trim();
  const fullName = String(data.fullName || "").trim();
  const assignedClasses = String(data.assignedClasses || "ALL").trim();
  const assignedSubjects = String(data.assignedSubjects || "ALL").trim();
  const phone = String(data.phone || "").trim();
  const status = String(data.status || "active").trim();
  const photoLink = String(data.photoLink || "").trim();

  if (!username || !password || !fullName) {
    return jsonResponse(
      false,
      "Username, password, and full name are required.",
    );
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("USERS");
  if (!sheet) return jsonResponse(false, "USERS sheet not found.");

  const rows = sheet.getDataRange().getValues();
  const usernameCol = 2;

  const existing = rows.slice(1).some(function (row) {
    return (
      String(row[usernameCol] || "").toLowerCase() === username.toLowerCase()
    );
  });
  if (existing) return jsonResponse(false, "Teacher username already exists.");

  const nextId =
    rows.length > 1
      ? Math.max.apply(
          null,
          rows.slice(1).map(function (row) {
            return Number(row[0]) || 0;
          }),
        ) + 1
      : 1;

  sheet.appendRow([
    nextId,
    "teacher",
    username,
    password,
    fullName,
    assignedClasses,
    assignedSubjects,
    photoLink,
    status,
    phone,
  ]);
  return jsonResponse(true, "Teacher added successfully.", {
    teacher: { username, fullName, role: "teacher" },
  });
}

function listTeachers() {
  const users = readSheetRows("USERS");
  return jsonResponse(true, "Teachers loaded.", {
    teachers: users.filter(function (row) {
      return String(row.Role || "").toLowerCase() === "teacher";
    }),
  });
}

function listStudents() {
  const students = readSheetRows("STUDENTS");
  return jsonResponse(true, "Students loaded.", { students: students });
}

function updateTeacher(data) {
  const username = String(data.username || "").trim();
  const fullName = String(data.fullName || "").trim();
  const password = String(data.password || "").trim();
  const assignedClasses = String(data.assignedClasses || "").trim();
  const assignedSubjects = String(data.assignedSubjects || "").trim();
  const phone = String(data.phone || "").trim();
  const status = String(data.status || "").trim();
  const photoLink = String(data.photoLink || "").trim();
  if (!username) return jsonResponse(false, "Teacher username is required.");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("USERS");
  if (!sheet) return jsonResponse(false, "USERS sheet not found.");
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(function (h) {
    return String(h).trim();
  });
  const index = findRowIndex(rows, "Username", username);
  if (index < 0) return jsonResponse(false, "Teacher not found.");
  const row = rows[index + 1];
  if (fullName) row[headers.indexOf("FullName")] = fullName;
  if (password && headers.indexOf("Password") >= 0)
    row[headers.indexOf("Password")] = password;
  if (assignedClasses)
    row[headers.indexOf("AssignedClasses")] = assignedClasses;
  if (assignedSubjects)
    row[headers.indexOf("AssignedSubjects")] = assignedSubjects;
  if (photoLink !== undefined && headers.indexOf("PhotoLink") >= 0)
    row[headers.indexOf("PhotoLink")] = photoLink;
  if (phone !== undefined && headers.indexOf("Phone") >= 0)
    row[headers.indexOf("Phone")] = phone;
  if (status && headers.indexOf("Status") >= 0)
    row[headers.indexOf("Status")] = status;
  sheet.getRange(index + 2, 1, 1, row.length).setValues([row]);
  return jsonResponse(true, "Teacher updated.");
}

function deleteTeacher(data) {
  const username = String(data.username || "").trim();
  if (!username) return jsonResponse(false, "Teacher username is required.");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("USERS");
  if (!sheet) return jsonResponse(false, "USERS sheet not found.");
  const rows = sheet.getDataRange().getValues();
  const index = findRowIndex(rows, "Username", username);
  if (index < 0) return jsonResponse(false, "Teacher not found.");
  sheet.deleteRow(index + 2);
  return jsonResponse(true, "Teacher deleted.");
}

function updateStudent(data) {
  const studentID = String(data.studentID || data.studentId || "").trim();
  const fullName = String(data.fullName || "").trim();
  const gender = String(data.gender || "").trim();
  const classValue = String(data.className || data.studentClass || "").trim();
  const academicYear = String(data.academicYear || "").trim();
  if (!studentID) return jsonResponse(false, "Student ID is required.");

  // --- Update STUDENTS sheet ---
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("STUDENTS");
  if (!sheet) return jsonResponse(false, "STUDENTS sheet not found.");
  const rows = sheet.getDataRange().getValues();
  const index = findRowIndex(rows, "StudentID", studentID);
  if (index < 0) return jsonResponse(false, "Student not found.");
  const row = rows[index + 1];
  row[0] = studentID;
  if (fullName) row[1] = fullName;
  if (gender) row[2] = gender;
  if (classValue) row[3] = classValue;
  if (academicYear) row[4] = academicYear;
  sheet.getRange(index + 2, 1, 1, row.length).setValues([row]);

  // --- Sync StudentName and Class changes to GRADES sheet ---
  if (fullName || classValue) {
    const gradesSheet =
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GRADES");
    if (gradesSheet) {
      const lastRow = gradesSheet.getLastRow();
      if (lastRow > 1) {
        const lastCol = gradesSheet.getLastColumn();
        const gRows = gradesSheet.getRange(1, 1, lastRow, lastCol).getValues();
        const gHeaders = gRows[0].map(function (h) {
          return String(h).trim().toLowerCase().replace(/\s+/g, "");
        });
        const sidCol = gHeaders.indexOf("studentid");
        const nameCol = gHeaders.indexOf("studentname");
        const classCol = gHeaders.indexOf("class");
        if (sidCol >= 0) {
          for (var i = 1; i < gRows.length; i++) {
            if (
              String(gRows[i][sidCol] || "")
                .trim()
                .toLowerCase() === studentID.toLowerCase()
            ) {
              if (fullName && nameCol >= 0) {
                gradesSheet.getRange(i + 1, nameCol + 1).setValue(fullName);
              }
              if (classValue && classCol >= 0) {
                gradesSheet.getRange(i + 1, classCol + 1).setValue(classValue);
              }
            }
          }
        }
      }
    }
  }

  return jsonResponse(true, "Student updated.");
}

function deleteStudent(data) {
  const studentID = String(data.studentID || data.studentId || "").trim();
  if (!studentID) return jsonResponse(false, "Student ID is required.");
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("STUDENTS");
  if (!sheet) return jsonResponse(false, "STUDENTS sheet not found.");
  const rows = sheet.getDataRange().getValues();
  const index = findRowIndex(rows, "StudentID", studentID);
  if (index < 0) return jsonResponse(false, "Student not found.");
  sheet.deleteRow(index + 2);
  return jsonResponse(true, "Student deleted.");
}

function findRowIndex(rows, key, value) {
  const headers = (rows[0] || []).map(function (name) {
    return String(name).trim();
  });
  const col = headers.indexOf(key);
  if (col < 0) return -1;
  for (let i = 1; i < rows.length; i++) {
    if (
      String(rows[i][col] || "").toLowerCase() === String(value).toLowerCase()
    )
      return i - 1;
  }
  return -1;
}

function getStudents() {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("STUDENTS");
  if (!sheet) return jsonResponse(false, "STUDENTS sheet not found.");
  return jsonResponse(true, "Students loaded.", {
    students: sheet.getDataRange().getValues(),
  });
}

function getDashboardSummary() {
  const users = readSheetRows("USERS");
  const students = readSheetRows("STUDENTS");
  const grades = readSheetRows("GRADES");
  const principals = users.filter(function (row) {
    return String(row.Role || "").toLowerCase() === "principal";
  });
  const teachers = users.filter(function (row) {
    return String(row.Role || "").toLowerCase() === "teacher";
  });
  const classNames = students
    .map(function (row) {
      return String(row.Class || "").trim();
    })
    .filter(Boolean)
    .filter(function (v, i, a) {
      return a.indexOf(v) === i;
    });
  return jsonResponse(true, "Dashboard loaded.", {
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

function readSheetRows(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const headers = (rows[0] || []).map(function (name) {
    return String(name).trim();
  });
  return rows
    .slice(1)
    .map(function (row) {
      const item = {};
      headers.forEach(function (name, index) {
        item[name] = row[index];
      });
      return item;
    })
    .filter(function (item) {
      return Object.values(item).some(function (v) {
        return String(v || "").trim() !== "";
      });
    });
}

function getGrades() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GRADES");
  if (!sheet) return jsonResponse(false, "GRADES sheet not found.");
  return jsonResponse(true, "Grades loaded.", {
    grades: sheet.getDataRange().getValues(),
  });
}

function getPrincipalProfile(data) {
  const username = String(data.username || "").trim();
  if (!username) return jsonResponse(false, "Username is required.");
  const users = readSheetRows("USERS");
  const user = users.find(function (row) {
    return String(row.Username || "").toLowerCase() === username.toLowerCase();
  });
  if (!user) return jsonResponse(false, "User not found.");
  return jsonResponse(true, "Profile loaded.", { user: user });
}

function getTeacherData(data) {
  const username = String(data.username || "").trim();
  if (!username) return jsonResponse(false, "Username is required.");

  // Find teacher record in USERS sheet
  const users = readSheetRows("USERS");
  const teacher = users.find(function (row) {
    return String(row.Username || "").toLowerCase() === username.toLowerCase();
  });
  if (!teacher) return jsonResponse(false, "Teacher not found.");

  const assignedClasses = String(teacher.AssignedClasses || "ALL").trim();
  const assignedSubjects = String(teacher.AssignedSubjects || "ALL").trim();

  // Build lists for comparison (lowercase, trimmed)
  const isAllClasses = assignedClasses.toUpperCase() === "ALL";
  const isAllSubjects = assignedSubjects.toUpperCase() === "ALL";

  const classList = assignedClasses
    .toLowerCase()
    .split(",")
    .map(function (c) {
      return c.trim();
    });
  const subjectList = assignedSubjects
    .toLowerCase()
    .split(",")
    .map(function (s) {
      return s.trim();
    });

  // Filter students by assigned classes
  const allStudents = readSheetRows("STUDENTS");
  const students = isAllClasses
    ? allStudents
    : allStudents.filter(function (s) {
        const studentClass = String(s.Class || "")
          .trim()
          .toLowerCase();
        return classList.some(function (c) {
          return studentClass === c;
        });
      });

  // ── Filter grades by BOTH assigned class AND assigned subject ───────────
  // Step 1: Always filter grades by the teacher's assigned class(es).
  //         A teacher should never see grades from classes they don't teach,
  //         even when AssignedSubjects = "ALL".
  // Step 2: If the teacher is NOT assigned to all subjects, also filter
  //         by their specific subject(s).
  // Expects GRADES sheet to have "Class" and "Subject" columns.
  const allGrades = readSheetRows("GRADES");

  const grades = allGrades.filter(function (g) {
    // ── Class gate (always applied) ──────────────────────────────────────
    const gradeClass = String(g.Class || "")
      .trim()
      .toLowerCase();
    const classAllowed = isAllClasses
      ? true
      : classList.some(function (c) {
          return gradeClass === c;
        });
    if (!classAllowed) return false;

    // ── Subject gate (skipped when teacher has ALL subjects) ─────────────
    if (isAllSubjects) return true;
    const gradeSubject = String(g.Subject || "")
      .trim()
      .toLowerCase();
    return subjectList.some(function (s) {
      return gradeSubject === s;
    });
  });
  // ────────────────────────────────────────────────────────────────────────

  // ── Build subject list from SUBJECTS sheet when teacher has ALL subjects ──
  // The SUBJECTS sheet has class names as column headers. We find the column(s)
  // matching the teacher's assigned class(es) and collect the non-empty subject
  // names from those columns — deduplicated and in sheet order.
  var classSubjects = [];
  const subjSheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("SUBJECTS");
  if (subjSheet && isAllSubjects) {
    const subjData = subjSheet.getDataRange().getValues();
    const subjHeaders = subjData[0].map(function (h) {
      return String(h).trim();
    });
    // Find which columns match the teacher's assigned class(es)
    var matchCols = [];
    if (isAllClasses) {
      // All columns except SubjectID and SubjectName
      for (var ci = 2; ci < subjHeaders.length; ci++) {
        if (subjHeaders[ci]) matchCols.push(ci);
      }
    } else {
      subjHeaders.forEach(function (h, ci) {
        // A header like "KG 1, KG 2" may cover multiple classes
        var headerClasses = h
          .toLowerCase()
          .split(",")
          .map(function (x) {
            return x.trim();
          });
        var matched = classList.some(function (tc) {
          return headerClasses.some(function (hc) {
            return hc === tc;
          });
        });
        if (matched) matchCols.push(ci);
      });
    }
    // Collect subjects from matched columns, deduplicated, preserving order
    var seen = {};
    for (var r = 1; r < subjData.length; r++) {
      matchCols.forEach(function (ci) {
        var val = String(subjData[r][ci] || "").trim();
        if (val && !seen[val.toLowerCase()]) {
          seen[val.toLowerCase()] = true;
          classSubjects.push(val);
        }
      });
    }
  }

  return jsonResponse(true, "Teacher data loaded.", {
    teacher: teacher,
    students: students,
    grades: grades,
    classSubjects: classSubjects,
    gradeHeaders: (function () {
      const gs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GRADES");
      if (!gs) return [];
      const hRow = gs.getRange(1, 1, 1, gs.getLastColumn()).getValues()[0];
      return hRow
        .map(function (h) {
          return String(h).trim();
        })
        .filter(Boolean);
    })(),
  });
}

function generateReport(data) {
  return jsonResponse(true, "Report generation ready.", {
    studentID: data.studentID || data.studentId || "",
  });
}

function saveGrade(data) {
  const studentID = String(data.studentID || "").trim();
  const studentName = String(data.studentName || "").trim();
  const className = String(data.className || "").trim();
  const subject = String(data.subject || "").trim();
  const grades = data.grades || {};
  const teacherUsername = String(data.teacherUsername || "").trim();

  if (!studentID || !subject)
    return jsonResponse(false, "Student ID and subject are required.");

  // Block inactive teachers from saving grades
  if (teacherUsername) {
    const users = readSheetRows("USERS");
    const teacher = users.find(function (u) {
      return (
        String(u.Username || "").toLowerCase() === teacherUsername.toLowerCase()
      );
    });
    if (teacher) {
      const tStatus = String(teacher.Status || "active")
        .trim()
        .toLowerCase();
      if (tStatus === "inactive") {
        return jsonResponse(
          false,
          "Your account is inactive. You cannot save grades.",
        );
      }
      if (tStatus === "blocked") {
        return jsonResponse(
          false,
          "Your account has been blocked. You cannot save grades.",
        );
      }
    }
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GRADES");
  if (!sheet) return jsonResponse(false, "GRADES sheet not found.");

  // Use getLastRow() instead of getDataRange() to avoid phantom rows
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return jsonResponse(false, "GRADES sheet is empty.");

  const lastCol = sheet.getLastColumn();
  const rows = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  const headers = rows[0].map(function (h) {
    return String(h).trim();
  });

  // Build normalised header index (lowercase, no spaces) for flexible matching
  const normHeaders = headers.map(function (h) {
    return h.toLowerCase().replace(/\s+/g, "");
  });

  function colIndex(name) {
    return normHeaders.indexOf(name.toLowerCase().replace(/\s+/g, ""));
  }

  const sidColEarly = normHeaders.indexOf("studentid");
  const subjColEarly = normHeaders.indexOf("subject");

  // Normalise a subject string for comparison:
  // lowercase, remove dots, remove all spaces so
  // "Physical Education", "Physical Edu", "P.E.", "PE" all reduce consistently
  function normSubject(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, "");
  }

  // Find existing row for this student + subject using fuzzy subject matching
  let rowIndex = -1;
  const incomingSID = studentID.toLowerCase();
  const incomingSubj = normSubject(subject);

  for (let i = 1; i < rows.length; i++) {
    const rowSID = String(
      rows[i][sidColEarly] !== undefined ? rows[i][sidColEarly] : "",
    )
      .trim()
      .toLowerCase();
    const rowSubj = normSubject(rows[i][subjColEarly]);

    // Skip completely empty rows
    if (!rowSID && !rowSubj) continue;

    if (rowSID === incomingSID && rowSubj === incomingSubj) {
      rowIndex = i;
      break;
    }
  }

  if (rowIndex === -1) {
    // No existing row — append a new one right after the last real data row
    const newRow = new Array(headers.length).fill("");
    const sidCI = colIndex("StudentID");
    if (sidCI >= 0) newRow[sidCI] = studentID;
    const snCI = colIndex("StudentName");
    if (snCI >= 0) newRow[snCI] = studentName;
    const clCI = colIndex("Class");
    if (clCI >= 0) newRow[clCI] = className;
    const subCI = colIndex("Subject");
    if (subCI >= 0) newRow[subCI] = subject;
    Object.keys(grades).forEach(function (col) {
      const ci = colIndex(col);
      if (ci >= 0) newRow[ci] = grades[col];
    });
    // Write directly to next row after last data — avoids phantom-row appendRow bug
    sheet.getRange(lastRow + 1, 1, 1, newRow.length).setValues([newRow]);
  } else {
    // Existing row — only write to blank cells (never overwrite)
    const row = rows[rowIndex];
    let skipped = [];
    Object.keys(grades).forEach(function (col) {
      const ci = colIndex(col);
      if (ci < 0) return;
      const cellVal = row[ci];
      const existing =
        cellVal !== null && cellVal !== undefined ? String(cellVal).trim() : "";
      if (existing === "" || existing === "—") {
        sheet.getRange(rowIndex + 1, ci + 1).setValue(grades[col]);
      } else {
        skipped.push(col);
      }
    });
    if (skipped.length > 0) {
      return jsonResponse(
        false,
        "These period(s) already have grades and cannot be overwritten: " +
          skipped.join(", ") +
          ". If this is wrong, please check your GRADES sheet directly.",
      );
    }
  }

  return jsonResponse(true, "Grade saved successfully.");
}

function getSubjects() {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("SUBJECTS");
  if (!sheet) return jsonResponse(false, "SUBJECTS sheet not found.");
  const data = sheet.getDataRange().getValues();
  if (!data.length)
    return jsonResponse(true, "No subjects found.", { subjectsByClass: {} });

  // Row 0 = headers (class names start at column index 2; col 0 = SubjectID, col 1 = SubjectName)
  const headers = data[0].map(function (h) {
    return String(h).trim();
  });

  // Build a map: className (lowercase) → ordered array of subject names
  var subjectsByClass = {};
  for (var ci = 2; ci < headers.length; ci++) {
    var classHeader = headers[ci];
    if (!classHeader) continue;
    // A header may cover multiple classes separated by commas: "KG 1, KG 2"
    var classKeys = classHeader.split(",").map(function (c) {
      return c.trim();
    });
    classKeys.forEach(function (cls) {
      if (!cls) return;
      var key = cls.toLowerCase();
      if (!subjectsByClass[key]) subjectsByClass[key] = [];
      for (var ri = 1; ri < data.length; ri++) {
        var val = String(data[ri][ci] || "").trim();
        if (val && subjectsByClass[key].indexOf(val) === -1) {
          subjectsByClass[key].push(val);
        }
      }
    });
  }

  return jsonResponse(true, "Subjects loaded.", {
    subjectsByClass: subjectsByClass,
  });
}

function jsonResponse(ok, message, extra) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok, message, ...(extra || {}) }),
  ).setMimeType(ContentService.MimeType.JSON);
}
