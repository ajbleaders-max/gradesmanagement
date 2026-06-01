# AJB Leaders Academy - GitHub Pages + Google Sheets Architecture

This project is now structured for the future public-hosted deployment you requested.

## Architecture
- Frontend: GitHub Pages (static HTML/CSS/JavaScript)
- Backend: Google Apps Script Web App API
- Database: Google Sheets only

## Folder structure
- index.html
- login.html
- admin.html
- teacher.html
- reportcard.html
- css/
- js/
- assets/

## Deployment flow
1. Create the Google Sheets database.
2. Deploy `api.gs` as a Google Apps Script Web App.
3. Copy the Web App URL to `js/api.js`.
4. Publish the root folder to GitHub Pages.
5. Attach a custom domain later if desired.

## Google Sheets setup (step by step)
1. Open Google Drive and create a new Google Spreadsheet.
2. Rename the file to something like `AJB Leaders Academy Grade System`.
3. Create these sheets at the bottom of the spreadsheet:
   - `USERS`
   - `STUDENTS`
   - `SUBJECTS`
   - `GRADES`
   - `SETTINGS`
   - `REPORT_COMMENTS`
4. Add the exact headers shown below.

### USERS sheet
| ID | Role | Username | Password | FullName | AssignedClasses | AssignedSubjects | PhotoLink | Status |

Example row:
| 1 | principal | admin | admin123 | Mr Doe | ALL | ALL | https://drive.google.com/uc?export=view&id=FILE_ID | active |

### STUDENTS sheet
| StudentID | FullName | Gender | Class | AcademicYear |

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

### GRADES sheet
| StudentID | StudentName | Class | Subject | Semester | Period1 | Period2 | Period3 | Period4 | Period5 | Period6 | Exam | Average | Teacher |

### SETTINGS sheet
| SchoolName | Motto | AcademicYear | PrincipalName |

Example row:
| AJB Leaders Academy | Excellence in Education | 2025-2026 | Principal Name |

### REPORT_COMMENTS sheet
| MinScore | MaxScore | Remark |

Example rows:
| 95 | 100 | Excellent |
| 90 | 94 | Very Good |
| 80 | 89 | Good |
| 70 | 79 | Average |
| 0 | 69 | Poor |

5. Add at least one principal user to the `USERS` sheet so you can log in.
6. Share the spreadsheet with the Google account that will own the Apps Script deployment.

## Notes
- The frontend uses fetch() and static hosting.
- The Apps Script backend returns JSON only.
- This design avoids Apps Script HTMLService page rendering.
