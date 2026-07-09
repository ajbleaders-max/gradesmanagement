# AJB Leaders Academy - GitHub Pages + Google Sheets Architecture

This project is structured for public-hosted deployment.

## Architecture
- Frontend: GitHub Pages (static HTML/CSS/JavaScript)
- Backend: Google Apps Script Web App API (`api.gs`, v2)
- Database: Google Sheets only

## What's new in v2 (read this if you had the app running before)
- **Passwords are hashed.** USERS no longer stores plaintext passwords — it
  stores `PasswordHash` + `Salt` (SHA-256).
- **Sessions.** Login returns a session token; every other request must
  include it. Tokens live in a `SESSIONS` sheet and expire after 12 hours.
  Role checks (principal vs teacher) are enforced server-side from the
  validated session, not from anything the browser claims.
- **Students are never hard-deleted.** A student's `Status`
  (Active / Withdrawn / Graduated / Transferred / Suspended) can change,
  but their row and grade history always remain.
- **Data is split by academic year** so no single sheet grows forever:
  - `STUDENT_MASTER` — permanent identity per student (name, DOB, parent
    info…), one row per student, forever.
  - `ENROLL_<year>` — that student's Class + Status for one specific year
    (e.g. `ENROLL_2025_2026`).
  - `GRADES_<year>` — that year's grade rows (e.g. `GRADES_2025_2026`).
  - `SETTINGS!AcademicYear` is "the current year" and decides which
    `ENROLL_`/`GRADES_` sheet the app reads and writes by default.

If you already have a live spreadsheet from v1, **run the migration once**
before switching the deployment over — see "Migrating existing data" below.

## Folder structure
- index.html
- login.html
- admin.html
- teacher.html
- manage-students.html / manage-teachers.html
- grades.html / grades_records.html / reportcard.html / student_profile.html
- css/
- js/
- assets/
- api.gs

## Deployment flow
1. Create the Google Sheets database (see setup below), or migrate an
   existing one (see below).
2. Deploy `api.gs` as a Google Apps Script Web App (Execute as: Me,
   Access: Anyone).
3. Copy the Web App URL into `API_URL` at the top of `js/api.js`.
4. Publish the root folder to GitHub Pages.
5. Attach a custom domain later if desired.

## Google Sheets setup (new spreadsheet, step by step)
1. Open Google Drive and create a new Google Spreadsheet.
2. Rename the file to something like `AJB Leaders Academy Grade System`.
3. Create these sheets with the exact headers below. (`ENROLL_<year>` and
   `GRADES_<year>` sheets, and the `SESSIONS` sheet, are created
   automatically by the app the first time they're needed — you don't have
   to make them by hand.)

### USERS sheet
| ID | Role | Username | PasswordHash | Salt | FullName | AssignedClasses | AssignedSubjects | PhotoLink | Status | Phone |

You can't hand-write a real `PasswordHash`/`Salt` pair easily, so create your
first principal account with a temporary row (leave PasswordHash/Salt blank),
then use `updateTeacher`/an admin flow to set a real password — or simplest:
temporarily add a plaintext `Password` column, fill it in, and run
`migrateLegacySchema()` once to hash it (see below), then delete that column.

### STUDENT_MASTER sheet
| StudentID | FullName | Gender | DateOfBirth | ParentName | ParentPhone | Address | EnrollmentDate |

### ENROLL_<year> sheet (e.g. `ENROLL_2025_2026`)
| StudentID | Class | Status | AcademicYear |

`Status` is one of: `Active`, `Withdrawn`, `Graduated`, `Transferred`, `Suspended`.

### SUBJECTS sheet
| SubjectID | SubjectName |

Example values:
| 1 | Bible |
| 2 | Math |
| 3 | English |
| 4 | Social Studies |
| 5 | Civics |
| 6 | Science |
| 7 | Reading |
| 8 | Spelling |
| 9 | Phonics |
| 10 | Health/Science |
| 11 | Writing |
| 12 | Home Activity |
| 13 | P.E |
| 14 | Conduct |

### GRADES_<year> sheet (e.g. `GRADES_2025_2026`)
| StudentID | StudentName | Class | Subject | Semester | Period1 | Period2 | Period3 | Period4 | Period5 | Period6 | Exam | Average | Teacher | AcademicYear |

### SETTINGS sheet
| SchoolName | Motto | AcademicYear | PrincipalName |

Example row:
| AJB Leaders Academy | Excellence in Education | 2025-2026 | Principal Name |

`AcademicYear` here is "the current year" — the app reads/writes
`ENROLL_2025_2026` / `GRADES_2025_2026` by default when this says `2025-2026`.

### SESSIONS sheet (auto-created, but here's the shape)
| Token | Username | Role | Status | ExpiresAt |

### REPORT_COMMENTS sheet
| MinScore | MaxScore | Remark |

Example rows:
| 95 | 100 | Excellent |
| 90 | 94 | Very Good |
| 80 | 89 | Good |
| 70 | 79 | Average |
| 0 | 69 | Poor |

4. Add at least one principal user to the `USERS` sheet so you can log in
   (see the password note above).
5. Share the spreadsheet with the Google account that will own the Apps
   Script deployment.

## Migrating existing data (v1 → v2)
If you already have a live spreadsheet with the old `STUDENTS`, `GRADES`,
and plaintext-password `USERS` sheets:

1. Paste the new `api.gs` into your Apps Script project (replacing the old
   one) and save.
2. Make sure `SETTINGS!AcademicYear` is set correctly — the migration
   assumes any grade/student row without its own year belongs to this year.
3. In the Apps Script editor, select **migrateLegacySchema** from the
   function dropdown at the top, then click **Run**.
4. Open **View > Logs** (or **Executions**) to see a full report of what was
   migrated.
5. It will:
   - Hash existing plaintext passwords into `PasswordHash`/`Salt`.
   - Build `STUDENT_MASTER` and `ENROLL_<year>` from the old `STUDENTS` sheet.
   - Build `GRADES_<year>` from the old `GRADES` sheet.
   - Rename the old sheets to `STUDENTS_LEGACY_BACKUP` and
     `GRADES_LEGACY_BACKUP` — **nothing is deleted.**
6. Spot-check the new sheets against the backups before relying on them.
   It's safe to re-run the migration; it skips anything already migrated.
7. Once you're confident, you can archive or remove the `*_LEGACY_BACKUP`
   sheets — or just leave them, they're inert.

## Starting a new academic year
From **Manage Students**, principals can:
- **Start New Academic Year** — creates empty `ENROLL_<year>`/`GRADES_<year>`
  sheets and sets `SETTINGS!AcademicYear` to that year.
- **Promote Active Students to New Year** — copies every currently `Active`
  student into the new year's enrollment with their existing class (adjust
  individual classes afterward as needed). Withdrawn/Graduated/Transferred
  students are not carried forward. Grades never carry forward — each year
  starts with a clean `GRADES_<year>` sheet.

## Notes
- The frontend uses fetch() and static hosting.
- The Apps Script backend returns JSON only.
- This design avoids Apps Script HTMLService page rendering.
- Session tokens expire after 12 hours; users are asked to log in again
  after that.
