# CORE: Conference Office Reservation Engine

CORE is a CSC Conference Office scheduling system for Adventist University of the Philippines. Students can reserve available slots after logging in, while CSC Officers/Admins control reservations, user access, privacy, blocked times, and activity logs.

## Features

- CSC/CORE dashboard inspired by Google Calendar
- FullCalendar week, month, year, and agenda views
- Desktop drag-to-select reservation creation
- Mobile tap-to-create fallback with editable time fields
- Supabase Auth login/register flow using student number and password
- Supabase PostgreSQL tables, RLS policies, activity logs, and overlap-prevention triggers
- Student and CSC Officer/Admin role behavior with admin approval for new admin accounts
- Privacy-aware student calendar display that hides other students' private reservation details
- Required CSC Conference Office terms and data privacy agreement before student bookings
- Student limits: maximum 5 hours per reservation and 2 reservations per Monday-Sunday week
- No duplicate student-number accounts
- Admin-handled forgotten-password requests through a Supabase Edge Function
- One-room scheduling only, with no room/resource selector
- No-overlap validation in both frontend JavaScript and database triggers
- Current availability indicator: Available Now or In Use Until
- Admin blocked time slots for maintenance, exams, school use, cleaning, and events
- Search, filters, reservation details, deletion confirmation, activity logs, About CORE, and toast messages

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Calendar UI: FullCalendar.js from CDN
- Backend/database: Supabase
- Authentication: Supabase Auth
- Database: Supabase PostgreSQL
- Hosting: static hosting ready for Vercel, Netlify, or GitHub Pages

## Project Files

```text
conference-room-calendar/
  index.html
  style.css
  script.js
  supabaseClient.js
  schema.sql
  README.md
  supabase/functions/review-password-reset/index.ts
```

## Run Locally

Open `index.html` in a browser, or serve the folder with any static server:

```bash
npx serve conference-room-calendar
```

The app starts on the CORE login/create-account page. This project is already wired to Supabase in `supabaseClient.js`.

## Supabase Setup

1. Create a Supabase project at https://supabase.com.
2. Open the SQL editor.
3. Paste and run the full contents of `schema.sql`.
4. Go to Project Settings, then API.
5. Copy your Project URL and publishable key.
6. Paste them into `supabaseClient.js`:

```js
const SUPABASE_URL = 'https://your-project-ref.supabase.co';
const SUPABASE_ANON_KEY = 'your-publishable-key';
```

7. Deploy the password reset Edge Function:

```bash
supabase functions deploy review-password-reset
```

The function uses `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase provides in the Edge Function environment. Never paste the service-role key into frontend JavaScript.

## Accounts

Users sign in with:

- Student number
- Password

Supabase Auth still uses an email identifier internally, so the frontend converts a student number into a private auth identifier like:

```text
202600001@aup.edu.ph
```

Students never type an email address in the UI.

Student numbers are normalized before signup and login. Spaces, hyphens, punctuation, and casing are ignored, so `2026-00001`, `2026 00001`, and `202600001` refer to the same account. Duplicate accounts are rejected by Supabase Auth and the `profiles.student_number` uniqueness rules.

Student accounts are created through the `create_student_account` database RPC, which creates confirmed Supabase Auth users without sending synthetic confirmation emails. If someone chooses `Request admin access`, the account is still created as a student first and an admin request is submitted. Only an existing admin can approve that request from the Admin Requests modal.

## Starter Admin

Supabase does not let a static frontend safely create a privileged admin account by itself. Use this bootstrap flow for a new deployment:

1. Run `schema.sql` in Supabase.
2. Create an account with this starter student number:

```text
AUP-ADMIN-001
```

3. Promote only that account in the Supabase SQL editor:

```sql
update public.profiles
set role = 'admin'
where student_number = 'aupadmin001';
```

The connected Supabase project already has this starter admin account. After the starter admin exists, future admin accounts must be requested from the create-account page and approved by an existing admin. Students cannot directly make themselves admins.

Students can view reserved/available time slots, create confirmed reservations when the slot is free, view full details for their own reservations only, and delete only reservations created by their own account. CSC Officers/Admins can create, edit, move, resize, override student limits, or delete any reservation, manage blocked times, and view activity history.

## Forgotten Passwords

Students use `Forgot password?` on the login page and submit their student number, full name, department, and optional message. Admins review requests from the Password Resets panel.

When an admin approves a request, the `review-password-reset` Edge Function:

- verifies the reviewer is an admin
- finds the student account by normalized student number
- generates a temporary password
- updates the user's Supabase Auth password
- marks the account with `must_change_password`
- returns the temporary password once to the admin

The temporary password is not stored in the database. The admin should give it to the student through an approved school channel. When the student logs in with the temporary password, the app forces them to create a new password before using the calendar.

## Scheduling Rules

- One conference office only
- No pending, approved, or rejected statuses
- Reservations are automatically confirmed if valid
- No past reservations
- Monday to Friday only
- School hours: 8:00 AM to 5:00 PM
- Student name, organization, date, start time, end time, number of people involved, and purpose are required
- Start time must be before end time
- Student reservations are limited to 5 hours
- Students are limited to 2 reservations per Monday-Sunday week
- Minimum advance booking: 1 day
- Confirmed reservations and blocked times prevent overlaps
- Deleted reservations are removed from the schedule immediately
- Completed reservations do not block future scheduling
- CSC Officers/Admins are not restricted by the 5-hour or 2-per-week student limits

Overlap logic:

```js
newStart < existingEnd && newEnd > existingStart
```

The same rule is enforced in `schema.sql` with PostgreSQL triggers, so users cannot bypass the frontend to create conflicts.

## Mobile Notes

Desktop and phones default to week view. Day view is removed from the UI. The sidebar becomes a hamburger menu, search expands on demand, forms stack vertically, and submenu panels use the full screen. If touch drag selection is difficult on a device, tap a time slot or use `+ CSC Conference Office`, then manually adjust the date and time fields.

Recommended test widths:

- 360px
- 390px
- 768px
- 1024px
- 1366px

## Deployment

This is a static frontend. Deploy the `conference-room-calendar` folder to:

- Vercel as a static project
- Netlify by dragging the folder into the deploy page
- GitHub Pages from the folder or repository root

Make sure `supabaseClient.js` contains the official CSC Supabase URL and publishable/anon key before deployment. Keep RLS enabled in Supabase; the anon key is safe for browser use only when RLS policies protect the database.

## CORE Turnover and Hosting

CORE should be deployed from an official CSC hosting account whenever possible, not only a personal account. CSC should own or have documented access to:

- GitHub repository or source-code handover archive
- GitHub Pages, Netlify, Vercel, or equivalent hosting project
- Supabase project ownership
- CSC Officer/Admin account transfer
- Database backup access and restore process
- Edge Function deployment access
- Secure credential handover records
- Future maintenance and update process

Official turnover details:

- System name: CORE - Conference Office Reservation Engine
- System purpose: secure scheduling and monitoring for the CSC Conference Office
- Developer/s: Lanz Ordoña
- Turnover date: May 27, 2026
- CSC representative: assigned Central Student Council officer
- Institution: Adventist University of the Philippines

Initial publishing and maintenance of the CORE web application shall be handled by Lanz Ordoña unless officially transferred to another assigned CSC technical officer.

## Data Privacy and Terms of Use

Reservation information is used only for CSC Conference Office scheduling, reservation verification, documentation, and administrative monitoring. Full private reservation details are visible only to the owning student and authorized CSC Officers/Admins.

Students must agree to:

- the CSC Conference Office Terms of Use and Code of Conduct
- the Data Privacy Agreement

## Required Supabase Update

After pulling these files, run the updated `schema.sql` in the Supabase SQL editor for the official CSC project. The schema adds:

- `account_email` on reservations
- reservation agreement records
- privacy-aware `get_calendar_reservations()` RPC
- owner-or-admin reservation delete RLS
- student booking-limit trigger
- richer activity log fields and descriptions
- settings for booking limits and room name
