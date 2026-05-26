# Claude Code Prompt v2 — Build & Deploy: "Status of Form D1 under CSUAS"

> **How to use this file:** Save this in an empty folder as `PROMPT.md`, then open Claude Code in that folder. This is v2. It supersedes any earlier prompt you may have used. Pair it with one of the two build guides: `BUILD_GUIDE_SUPABASE.md` (recommended for first run) or `BUILD_GUIDE_AWS.md` (for production hand-off to a government cloud team).

---

## 0. ROLE & MISSION

You are a senior full-stack engineer. Build, test, and deploy a production-grade multi-user web portal called **"Status of Form D1 under CSUAS"** that monitors the live status of every Form D1 application under India's **Certification Scheme for Unmanned Aircraft Systems (CSUAS)** — from submission, through Certification Body (CB) review, Stage 1 & Stage 2 audits, Statement of Conformity (SoC), DGCA review, grant of **Type Certificate (TC)**, the post-TC **QCI–Manufacturer Agreement** (CB-facilitated), and through annual surveillance audits. The portal must monitor Turnaround Time (TAT) at every milestone and fire reminders when statutory time limits approach or are breached.

Work autonomously, but obey the rules in §1 (Working Rules). Ask only when a decision genuinely cannot be inferred from this document.

---

## 1. WORKING RULES — read this first, follow it always

These rules exist because earlier runs failed by skipping them. They take precedence over every other instruction in this document.

### 1.1 Honesty Rule (non-negotiable)

A step in `PLAN.md` is only marked `[x]` when there is a **real-world artifact proving it works**. Specifically:

| Step | What proves it is done |
|---|---|
| Bootstrap | `pnpm typecheck` and `pnpm test` both pass on a real run; `pnpm dev` starts without error |
| Provision database / auth / storage | Real credentials present in `.env.local`; a `curl` or SDK call against the live service returns a non-error response |
| Apply schema + seed | A SQL query against the **live** database returns the seeded rows; output shown to the user |
| RLS / authorization | A test where a non-admin user tries to read another tenant's row and the database **refuses**; output shown to the user |
| Auth flow | A real login at `localhost:3000` produces a session cookie; verified by visiting a protected route |
| Each feature | An end-to-end Playwright test exists for it and passes; output shown to the user |
| Deployment | A public URL returns HTTP 200 for `/healthz`; output shown to the user |

**Schema files on disk do not count. SQL migration files on disk do not count. `.env.example` with placeholders does not count. Files written by a sub-agent do not count.** If you cannot show real output, the step is `[ ]`.

### 1.2 No sub-agents during the build

Do not spawn `Agent(...)` sub-tasks that go on to write multiple files in the background without per-file approval. Every file write and every shell command must be a top-level action that the user can approve or reject. If a refactor needs many files, break it into individually approved writes.

### 1.3 One step at a time

Work through `PLAN.md` strictly in the order listed. Do not start step N+1 until step N has a green `[x]` per §1.1. Do not silently jump ahead. If you find a dependency was missed in an earlier step, stop, surface it to the user, and fix the earlier step first.

### 1.4 Stay inside the project folder

All file writes and reads must be within the current project folder. Do not read from `~/.claude/`, `/tmp/`, the user's home directory, or any path outside the project, unless the user explicitly asks for it.

### 1.5 Surface uncertainty out loud

If a command fails, paste the first 10 lines of the error in your response and explain what you think went wrong before retrying. Do not silently retry the same command. Do not guess at versions; check what's installed (`pnpm why`, `cat package.json`).

### 1.6 Update `DECISIONS.md` whenever you deviate

Any deviation from this document — picking a different version of a library, swapping an approach, skipping an optional step — gets a one-paragraph entry in `DECISIONS.md` with the reason. The user reviews `DECISIONS.md` periodically.

### 1.7 Pinned versions (avoid surprise breakages)

When installing, prefer these tested combinations. Do not use the latest of anything without checking:

- Node.js: 20.x LTS (avoid v24 — too new, ecosystem not fully ready)
- Next.js: `14` (App Router)
- React: `18`
- Prisma: **`5.x`** (NOT 7 — v7 changed the schema config format and breaks every tutorial)
- TypeScript: `5.x`
- Tailwind: `3.x`
- Supabase JS: latest minor of v2

If the user has a different Node version, install nvm and use `nvm install 20 && nvm use 20` before anything else.

### 1.8 Pause points

After each completed step, write a one-line summary to `RESUME.md` of what's done, what's next, and the exact prompt the user should paste to resume. The user may stop at any moment; `RESUME.md` is their bookmark.

---

## 2. PRODUCT OVERVIEW

A multi-user web portal to monitor the live status of Form D1 application till Type Certificate (TC), monitor TAT, and generate reports monthly. The applicant applies for Form D1 on an online platform (owned by the Central Government), fills required data, uploads mandatory documents, and chooses a CB; the application is then generated. If the Certification Body is **NABCB-accredited**, the portal must additionally provide a view of the **annual surveillance schedule** that the CB plans for that application/model **after** the Type Certificate has been issued. After TC issuance, the CB must facilitate the **QCI–Manufacturer Agreement** immediately.

---

## 3. DOMAIN GLOSSARY

- **CSUAS** — Certification Scheme for Unmanned Aircraft Systems (India).
- **Form D1** — application for Type Certificate of a UAS model.
- **OEM / Manufacturer / Applicant** — entity submitting Form D1.
- **CB** — Certification Body. Some CBs are **NABCB-accredited** (flag on the CB record).
- **NABCB** — National Accreditation Board for Certification Bodies (a constituent board of QCI).
- **QCI** — **Quality Council of India**. **In this portal, the Admin role represents QCI** — every Admin user is a QCI officer. Wherever this document says "Admin", read "QCI".
- **DGCA** — Directorate General of Civil Aviation (issues the TC).
- **NC** — Non-Conformity raised by a CB during review/audit.
- **CRM** — Corrective Action / closure document uploaded against an NC.
- **SoC** — Statement of Conformity, submitted by CB to DGCA after Stage 2 closure and technical review.
- **TC** — Type Certificate, granted by DGCA.
- **QCI–Manufacturer Agreement** — the post-TC agreement between QCI and the manufacturer that the CB must **facilitate immediately** after the Type Certificate is granted (see Process 6).
- **TAT** — Turnaround Time (overall and per-stage).

---

## 4. USER ROLES & PERMISSIONS

Three roles, gated by an `email_whitelist` table that maps emails → role and (for CB users) → CB organisation. Resolve the role at login.

### 4.1 Admin (QCI)
The Admin role represents **QCI (Quality Council of India)**. Every admin user is a QCI officer.

- Multiple admin accounts allowed (dedicated IDs per QCI officer).
- View **everything**.
- Add new CBs / update CB master data (name, NABCB-accredited yes/no, accreditation expiry, contact person, address).
- Edit any record at any stage.
- Delete entries (soft delete with audit trail).
- Export filtered CSV.
- View full analytics: total applications, count at each stage, count of rejected applications grouped by rejection category, average TAT per stage, overdue list, **list of post-TC applications awaiting QCI–Manufacturer agreement signing**.
- **Counter-sign the QCI–Manufacturer agreement** (see Process 6) and record the QCI signing date.

### 4.2 CB / Client (registered, restricted)
- Multiple users per CB allowed.
- View **all records belonging to their CB** in full detail.
- For **other CBs' records**: see only the public projection (defined in §4.4).
- Add new entries for their own applications and progress them through the workflow.
- Track their own TAT status; receive reminders on their applications.

### 4.3 Public (registered, view-only)
- Must register to view.
- Can only see the public projection (§4.4).

### 4.4 Public Projection — what "publicly available data" means

Transparency without exposing sensitive or commercially damaging internals. The public sees *which* application is at *which* stage and *when* it got there; they do not see findings, failures, documents, or the names of individuals.

#### Public

**Identification (read-only):**
- `formNumber`
- Manufacturer name
- UAS model name (and variant if any)
- CB name
- Whether the CB is NABCB-accredited (yes/no)

**Stage progression — labels + dates only.** Pending milestones render as "Pending":
- Application submitted — `submissionDate`
- Application accepted by CB — `reviewDecisionDate` (only when `ACCEPTED`)
- Stage 1 started — `stage1ScheduleFrom`
- Stage 1 closed — `stage1ClosureDate`
- Stage 2 started — `stage2ScheduleFrom`
- Stage 2 closed — `stage2ClosureDate`
- SoC submitted to DGCA — `socSubmittedDate`
- Type Certificate issued — `tcIssuedDate`
- QCI–Manufacturer agreement initiated — `qciAgreementInitiatedDate`
- QCI–Manufacturer agreement completed — `qciAgreementCompletedDate`
- Annual surveillance audits — `plannedFrom` / `plannedTo` (NABCB-accredited CB applications post-TC; planned dates only)

**Status fields:**
- Current stage label
- Status label (`IN_PROGRESS`, `REJECTED`, `TC_ISSUED`, `WITHDRAWN`) — fact of rejection is public; category and reason are not.
- `qciAgreementStatus` (`NOT_STARTED` / `INITIATED` / `MANUFACTURER_SIGNED` / `COMPLETED`).
- Attempt number — but not the link or content of prior attempts.

#### Not public — never exposed
- Reviewer name, designation, organisation
- Evaluator names and CSUAS clause competencies
- NC contents, NC iteration dates, CRM documents
- Manufacturer's NC response dates and content
- DGCA observation contents and iterations
- Rejection category and rejection reason (the why)
- Any uploaded document (Form D1, technical files, test reports, CRM, NC closure evidence, SoC, TC PDF, QCI–Manufacturer agreement drafts and signed copies, surveillance reports)
- The identity of the QCI officer who counter-signed (`qciSignedById`)
- Surveillance audit outcomes / reports
- `addedBy` email and internal remarks
- Manufacturer and CB contact details
- Audit log / event trail

#### Implementation
- Implement the public projection as a database **view** named `public_application_timeline` selecting only the columns enumerated above.
- Same pattern for surveillance: a `public_surveillance_schedule` view exposing planned dates only.
- Documents, NCs, observations, evaluators, and the audit log have **no** public view — RLS / authorization denies SELECT entirely to non-owning CB users and to public users.

---

## 5. DATA MODEL

```prisma
model AppUser {
  id            String   @id @default(uuid())
  email         String   @unique
  fullName      String
  role          Role     // ADMIN | CB_USER | PUBLIC
  cbId          String?  // required if role = CB_USER
  cb            CB?      @relation(fields: [cbId], references: [id])
  designation   String?
  organisation  String?
  createdAt     DateTime @default(now())
}
enum Role { ADMIN CB_USER PUBLIC }

model CB {
  id                  String   @id @default(uuid())
  name                String   @unique
  isNabcbAccredited   Boolean  @default(false)
  nabcbExpiryDate     DateTime?
  contactPersonName   String?
  contactDesignation  String?
  contactEmail        String?
  contactPhone        String?
  address             String?
  users               AppUser[]
  applications        Application[]
}

model Manufacturer {
  id           String   @id @default(uuid())
  name         String
  contactEmail String
  contactPhone String?
  applications Application[]
}

model Application {
  id                  String   @id @default(uuid())
  formNumber          String   @unique
  manufacturerId      String
  manufacturer        Manufacturer @relation(fields: [manufacturerId], references: [id])
  modelName           String
  modelVariant        String?
  cbId                String
  cb                  CB       @relation(fields: [cbId], references: [id])
  submissionDate      DateTime
  attemptNumber       Int       @default(1)
  parentApplicationId String?
  parent              Application? @relation("Resubmission", fields: [parentApplicationId], references: [id])
  resubmissions       Application[] @relation("Resubmission")

  currentStage        Stage    @default(APPLICATION_REVIEW)
  status              AppStatus @default(IN_PROGRESS)

  // Process 1
  reviewerName        String?
  reviewerDesignation String?
  reviewerOrg         String?
  reviewDecisionDate  DateTime?
  reviewDecision      ReviewDecision?
  rejectionCategory   RejectionCategory?
  rejectionReason     String?

  // Process 2 — Stage 1
  stage1ScheduleFrom  DateTime?
  stage1ScheduleTo    DateTime?
  stage1ClosureDate   DateTime?

  // Process 3 — Stage 2
  stage2ScheduleFrom  DateTime?
  stage2ScheduleTo    DateTime?
  stage2ClosureDate   DateTime?

  // Process 4 — SoC
  socReviewDate       DateTime?
  socSubmittedDate    DateTime?

  // Process 5 — DGCA
  dgcaReviewStartedAt DateTime?
  tcIssuedDate        DateTime?

  // Process 6 — QCI–Manufacturer Agreement
  qciAgreementStatus       QciAgreementStatus @default(NOT_STARTED)
  qciAgreementInitiatedDate DateTime?
  qciAgreementDraftSentDate DateTime?
  manufacturerSignedDate    DateTime?
  qciSignedDate             DateTime?
  qciSignedById             String?
  qciSignedBy               AppUser? @relation("QciSigner", fields: [qciSignedById], references: [id])
  qciAgreementCompletedDate DateTime?

  addedById           String
  addedBy             AppUser  @relation(fields: [addedById], references: [id])
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime?

  documents           Document[]
  evaluators          ApplicationEvaluator[]
  ncs                 NonConformity[]
  observations        DgcaObservation[]
  surveillances       SurveillanceAudit[]
  reminders           Reminder[]
  events              ApplicationEvent[]
}

enum Stage {
  APPLICATION_REVIEW
  STAGE_1
  STAGE_2
  TECHNICAL_REVIEW_SOC
  DGCA_REVIEW
  TC_ISSUED
  QCI_AGREEMENT
  POST_TC_SURVEILLANCE
}
enum AppStatus { IN_PROGRESS REJECTED TC_ISSUED WITHDRAWN }
enum ReviewDecision { ACCEPTED REJECTED }
enum RejectionCategory {
  EXCEEDS_60_DAYS
  INSUFFICIENT_DOCUMENTS
  NO_RESPONSE_TO_NCS
  OTHER
}
enum QciAgreementStatus {
  NOT_STARTED
  INITIATED
  MANUFACTURER_SIGNED
  COMPLETED
}

model Document {
  id            String   @id @default(uuid())
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id])
  type          DocType
  fileName      String
  storagePath   String
  uploadedById  String
  uploadedAt    DateTime @default(now())
}
enum DocType {
  FORM_D1
  TECHNICAL_FILE
  TEST_REPORT
  CRM_DOCUMENT
  NC_CLOSURE_EVIDENCE
  SOC
  TYPE_CERTIFICATE
  QCI_MANUFACTURER_AGREEMENT_DRAFT
  QCI_MANUFACTURER_AGREEMENT_SIGNED
  SURVEILLANCE_REPORT
  OTHER
}

model ApplicationEvaluator {
  id             String   @id @default(uuid())
  applicationId  String
  application    Application @relation(fields: [applicationId], references: [id])
  stage          Stage
  evaluatorName  String
  competencyClauses String[]
}

model NonConformity {
  id              String   @id @default(uuid())
  applicationId   String
  application     Application @relation(fields: [applicationId], references: [id])
  stage           Stage
  iteration       Int
  raisedDate      DateTime
  description     String
  crmStoragePath  String?
  manufacturerResponseDate DateTime?
  closureEvidencePath String?
  closedDate      DateTime?
  createdAt       DateTime @default(now())
}

model DgcaObservation {
  id            String   @id @default(uuid())
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id])
  iteration     Int
  raisedDate    DateTime
  description   String
  cbResponseDate DateTime?
  resolvedDate   DateTime?
}

model SurveillanceAudit {
  id              String   @id @default(uuid())
  applicationId   String
  application     Application @relation(fields: [applicationId], references: [id])
  yearOfAudit     Int
  plannedFrom     DateTime
  plannedTo       DateTime
  actualFrom      DateTime?
  actualTo        DateTime?
  outcome         String?
  reportPath      String?
}

model ApplicationEvent {
  id            String   @id @default(uuid())
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id])
  eventType     String
  payload       Json
  actorId       String
  occurredAt    DateTime @default(now())
}

model Reminder {
  id            String   @id @default(uuid())
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id])
  kind          ReminderKind
  dueAt         DateTime
  sentAt        DateTime?
  recipients    String[]
  message       String
}
enum ReminderKind {
  CB_DECISION_DAY_6
  PROCESS_1_TO_4_DAY_60
  DGCA_REVIEW_DAY_15
  NC_RESPONSE_OVERDUE
  QCI_AGREEMENT_PENDING
  QCI_AGREEMENT_OVERDUE
  SURVEILLANCE_DUE
}
```

---

## 6. PROCESS WORKFLOW

Every stage transition writes an `ApplicationEvent` row. Re-submissions (2nd, 3rd, … nth) link via `parentApplicationId` while keeping prior history viewable.

### Process 1 — Application Review (≤ 7 days)
- CB scrutinises documents and accepts or rejects within 7 days from submission (day 1 = application day).
- Capture **reviewer name, designation, organisation**.
- **Reminder**: alert CB on **day 6**.
- **1.1 Accepted** → advance to Stage 1.
- **1.2 Rejected** → record category (dropdown: `EXCEEDS_60_DAYS`, `INSUFFICIENT_DOCUMENTS`, `NO_RESPONSE_TO_NCS`, `OTHER`) and detailed reason (required free text).
- Re-submissions: new `Application` row, `attemptNumber += 1`, `parentApplicationId` set.

### Process 2 — Stage 1 (Document Review)
- Capture audit schedule: from/to dates, evaluators (name + CSUAS-clause competency, multi-select).
- **2.1** NC raised → record date of communication, upload CRM document.
- **2.2** Manufacturer response → record response date.
- Multiple iterations supported.
- **Stage 1 Closure date** → advance to Stage 2.

### Process 3 — Stage 2 (Onsite Audit)
- Same shape as Stage 1: audit schedule, evaluators with clause competency, NC iterations with CRM uploads and response dates.
- **Stage 2 Closure date** → advance to Technical Review.

### Process 4 — Statement of Conformity
- Date of review, evaluators with clause competency.
- Once cleared, CB submits SoC to DGCA.
- **60-day rule**: if Process 1 → Process 4 not complete within 60 days of submission, fire reminder on day 60.

### Process 5 — Grant of Type Certificate
- DGCA reviews; must issue TC within **15 days**.
- If unsatisfactory: DGCA raises observations with **15-day CB response window**; multiple iterations recorded.
- When satisfactory: TC granted (`tcIssuedDate`).
- After TC the application **does not end** — it advances immediately to Process 6 and (for NABCB-accredited CBs) the surveillance schedule view becomes available in parallel.

### Process 6 — QCI–Manufacturer Agreement (post-TC, CB-facilitated, immediate)

**As soon as the TC is issued, the CB must facilitate the agreement between QCI and the manufacturer immediately.** The application is not fully closed until both parties sign.

1. **Trigger.** Setting `tcIssuedDate` advances `currentStage` to `QCI_AGREEMENT`, sets `qciAgreementStatus = NOT_STARTED`, fires reminder to CB and QCI admins.
2. **CB initiates.** Records `qciAgreementInitiatedDate`, uploads `QCI_MANUFACTURER_AGREEMENT_DRAFT`. Status → `INITIATED`.
3. **Manufacturer signs.** Records `manufacturerSignedDate`, uploads signed copy. Status → `MANUFACTURER_SIGNED`.
4. **QCI counter-signs.** A QCI admin records `qciSignedDate` and uploads `QCI_MANUFACTURER_AGREEMENT_SIGNED`. System auto-sets `qciSignedById = current user id`. Status → `COMPLETED`, `qciAgreementCompletedDate` set.
5. **Closure.** `currentStage` advances to `POST_TC_SURVEILLANCE`.

Rules:
- **Target TAT**: agreement `COMPLETED` within **7 calendar days** of `tcIssuedDate` (configurable, §16).
- **Reminders**: see `QCI_AGREEMENT_PENDING` and `QCI_AGREEMENT_OVERDUE` in §8.
- **Permissions**: only CB users on the owning CB can record initiation / draft / manufacturer signing; **only QCI admins** can record `qciSignedDate` and upload the executed copy. Enforced at the database (RLS or equivalent) — not in the UI.

---

## 7. TAT TRACKING

Persist and display this milestone chain end-to-end:

1. Form D1 Acceptance Date
2. Stage 1 Audit Schedule (from / to)
3. Stage 1 NCs — iteration 1, 2, … n
4. Manufacturer's response to each Stage 1 NC
5. Stage 1 Closure date
6. Stage 2 Audit Plan (from / to)
7. Stage 2 Opening / Closing remarks
8. Stage 2 NCs — iteration 1, 2, … n
9. Closure evidence for Stage 2 NCs
10. Final Evaluation
11. Issuance of SoC to DGCA
12. Grant of Type Certificate
13. **QCI–Manufacturer Agreement — initiated, manufacturer-signed, QCI-signed, completed** (target ≤ 7 days from TC)
14. Use of Certification Mark (date of first use; valid only after agreement `COMPLETED`)
15. Production Oversight — annual surveillance audit
16. Delta Changes & TAT tracking
17. New Type Certificate Issuance (if delta change triggers a new TC)

For each milestone compute target TAT, actual TAT, and status ∈ { `On-time`, `Delayed`, `Overdue`, `Pending` }. Overdue rows render in red.

---

## 8. REMINDER ENGINE

A scheduled job runs **hourly** evaluating open applications, inserts due `Reminder` rows, dispatches email. Rules:

- **CB_DECISION_DAY_6** — day 6 (inclusive) if `reviewDecision` null. Recipients: CB reviewer + CB contact + admins.
- **PROCESS_1_TO_4_DAY_60** — day 60 from submission if `socSubmittedDate` null. Recipients: CB users + admins + manufacturer.
- **DGCA_REVIEW_DAY_15** — day 15 from `socSubmittedDate` if `tcIssuedDate` null and no open observation. Recipients: admins.
- **NC_RESPONSE_OVERDUE** — NC has no `manufacturerResponseDate` and configured window elapsed.
- **QCI_AGREEMENT_PENDING** — day after `tcIssuedDate` if `qciAgreementStatus = NOT_STARTED`. Re-fires daily until `INITIATED`. Recipients: CB users + admins + manufacturer.
- **QCI_AGREEMENT_OVERDUE** — day 7 from `tcIssuedDate` if not `COMPLETED`. Recipients: CB users + admins + manufacturer.
- **SURVEILLANCE_DUE** — 30 days before each planned annual surveillance window for NABCB-accredited CBs.

**Idempotency:** unique index on `(applicationId, kind, dueAt)`. The daily re-fire of `QCI_AGREEMENT_PENDING` uses calendar date as `dueAt` so each day is distinct but each day fires at most once.

---

## 9. CORE FEATURES

### 9.1 Authentication
Login / Register screens. Role detection from email whitelist. Persistent session. Sign out.

### 9.2 Dashboard — CB-wise + overall
Tiles: Total Form D1 Applications · TCs Issued · SoCs Issued · In-process Stage 1 · In-process Stage 2 · Rejected · **QCI–Manufacturer Agreement pending** (overdue red) · Last updated (live).

Plus **Live TAT panel**: in-progress applications grouped by stage; overdue in red.

### 9.3 TC Registry
Search by manufacturer / model / CB (all roles — these fields are public). Filter by CB / manufacturer / model. Sort any column. **100/page** pagination. Click row → detail. CSV export of filtered set (admins: full columns; CB users: full for own CB else public projection; public users: public projection).

### 9.4 New Application
Form-driven creation with mandatory uploads. **Real-time sync** — other connected users see new entries within 2 seconds without refresh.

### 9.5 Detail View
All fields. If submission + TC dates both exist → show actual TAT, target TAT, status badge. If only submission → progress bar. Vertical stepper timeline. `addedBy` email. **Admins see Delete** (soft). NABCB-accredited + TC issued → Surveillance Schedule tab.

### 9.6 Admin (QCI) Analytics
Total applications · per-stage counts · rejected by category with reasons (admins only) · avg TAT per stage · overdue list (CSV) · monthly report (PDF/CSV) · **post-TC applications awaiting QCI counter-signature**.

---

## 10. ACCESS CONTROL

Implement at the database layer (Postgres RLS, or equivalent) — not in the UI. Application code may also enforce, but the database is the source of truth.

- `Application` SELECT:
  - Admins: all rows.
  - CB users: full rows where `cbId = caller's CB`. Other rows: only via `public_application_timeline` view.
  - Public users: only `public_application_timeline`.
- `Application` INSERT/UPDATE: Admins always; CB users only on own CB.
- `Application` DELETE: Admins only (soft delete).
- `Document`, `NonConformity`, `DgcaObservation`, `SurveillanceAudit`, `ApplicationEvaluator`, `ApplicationEvent`: same scoping as parent.
- `qciSignedDate`, `qciSignedById`: writable only by Admins.
- `CB` master data: read by all authenticated users; write by Admins only.
- `email_whitelist`: Admins only.

---

## 11. UI / UX

- Sober government-portal aesthetic. No gradients, no emojis. Slate / steel blue / red (overdue) / green (on-time) / amber (at-risk).
- Sidebar: Dashboard · TC Registry · New Application · CB Master (admins) · Analytics (admins) · Surveillance · Settings.
- Top bar: search · notifications bell · profile menu.
- Detail page: vertical stepper for milestones, NCs nested under their stage, Documents tab.
- Dates: `dd MMM yyyy` (e.g. `02 May 2026`). Timestamps in IST.
- Mobile-responsive (registry collapses to cards under 768 px).
- Accessibility: keyboard navigable, focus rings, AA contrast.

---

## 12. NON-FUNCTIONAL

- Audit trail: every create/update/delete/state-transition writes `ApplicationEvent`. Never deleted.
- Soft delete only on `Application`. Hard delete forbidden.
- Idempotency on reminders (unique index).
- Time zone: store UTC, display IST. Calendar days, application day inclusive.
- Backups: rely on the chosen backend's daily backups; document restore in `RUNBOOK.md`.
- Observability: structured JSON logs (request id, user id, action). `/healthz` endpoint.
- Performance: registry p95 < 800 ms with 10k applications. Indexes on `cbId`, `manufacturerId`, `currentStage`, `submissionDate`, `tcIssuedDate`.

---

## 13. DEPLOYMENT TARGETS — CHOOSE ONE

This document is backend-agnostic. The app's domain logic, schema, and features do not change. The deployment target determines which managed services back the database, auth, file storage, scheduled jobs, and email.

### Option A — Supabase + Vercel (recommended for first build)
- **DB & RLS:** Supabase Postgres
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage (`documents`, `surveillance` buckets)
- **Scheduled jobs:** Supabase Edge Function + `pg_cron`
- **Email:** Resend
- **Hosting:** Vercel (Next.js)

Follow `BUILD_GUIDE_SUPABASE.md`.

### Option B — AWS (for India-government compliance, MeitY empanelment, STQC audit)
- **DB & RLS:** Amazon RDS for PostgreSQL (Mumbai region) with native Postgres RLS
- **Auth:** Amazon Cognito User Pool
- **Storage:** Amazon S3 (`documents`, `surveillance` buckets, private, KMS-encrypted)
- **Scheduled jobs:** AWS Lambda + EventBridge Scheduler (hourly)
- **Email:** Amazon SES
- **Hosting:** AWS Amplify Hosting (Next.js) — or ECS Fargate if Amplify is too constrained
- **Networking:** VPC with private subnets for RDS; NAT for Lambda egress
- **Observability:** CloudWatch Logs + X-Ray
- **Secrets:** AWS Secrets Manager

Follow `BUILD_GUIDE_AWS.md`. **Recommended only after Option A MVP works** — porting is straightforward; building AWS-first while learning Claude Code is not.

### Option C — Hybrid (Supabase data plane, AWS hosting)
- **DB / Auth / Storage / Realtime:** Supabase (Mumbai)
- **Hosting:** AWS Amplify (Next.js)
- **Email:** Amazon SES
- **Scheduled jobs:** Supabase Edge Function

Useful if procurement requires AWS hosting but Supabase is acceptable for the data plane (sometimes the case with research / pilot deployments). Document the data-residency contract with Supabase in `DECISIONS.md`.

The implementation plan in §14 is identical across options. Each step's tooling-specific commands are in the matching build guide.

---

## 14. IMPLEMENTATION ORDER

Strict order. Each step ends with a green `[x]` per the Honesty Rule (§1.1).

1. **Bootstrap** — Next.js 14 + TS + Tailwind + shadcn/ui + Prisma 5. `pnpm typecheck && pnpm test` pass. `pnpm dev` starts.
2. **Provision backend** — per chosen guide. **`.env.local` has real credentials. A live API call to the chosen service succeeds.**
3. **Schema + RLS + seed** — Prisma migration applied to **live DB**. RLS policies in place. Seed inserts: 2 CBs (1 NABCB-accredited, 1 not), 1 admin (you), 1 CB user, 1 public user, 1 manufacturer. **A SQL query against the live DB returns the seed rows.** **An RLS test confirms a non-admin cannot read another CB's row.**
4. **Auth + role resolution** — login / register / sign-out / persistent session / email whitelist gating. **A real login at localhost produces a session.**
5. **CB Master** admin CRUD.
6. **New Application** form with mandatory uploads + real-time insert broadcast.
7. **Registry** — search, filter, sort, paginate 100/page, CSV export.
8. **Detail page** — timeline, NCs, documents tab, evaluators, observations, soft-delete (admin).
9. **Process state machine** — re-submission linking, **Process 6** (QCI agreement) with split CB-vs-QCI permissions and auto-stage-advance.
10. **TAT calculators** + status badges + overdue red highlighting.
11. **Reminder engine** — scheduled job + email + unique-index idempotency. All 7 reminder kinds.
12. **Dashboard** — CB-wise tiles incl. *QCI Agreement pending*, live TAT panel, last-updated via realtime.
13. **Admin Analytics** + monthly report + post-TC awaiting-signature list.
14. **Surveillance** — for NABCB-accredited CBs post-TC.
15. **Tests** — Vitest (TAT math, RLS helpers); Playwright e2e: register → login → create → CB accepts → Stage 1 NC iteration → Stage 2 → SoC → TC → CB initiates QCI agreement → manufacturer signs → QCI admin counter-signs → surveillance scheduled.
16. **Deploy** — per chosen guide. **Public URL returns 200 on `/healthz`.** Scheduled job verified by manual run.
17. **Docs** — `README.md`, `RUNBOOK.md`, `DECISIONS.md` complete.

---

## 15. ACCEPTANCE CRITERIA

- [ ] Three roles enforced at the database level (RLS test: non-admin cannot read another CB's NCs).
- [ ] **Public projection matches §4.4 exactly** — public user query returns identification + stage timeline + status; cannot retrieve NCs, CRM, observations, evaluators, reviewer, rejection reason, documents, surveillance outcomes, audit log.
- [ ] Application moves through Application Review → Stage 1 → Stage 2 → SoC → DGCA → TC → QCI Agreement → Surveillance, with multiple NC iterations and DGCA observation iterations.
- [ ] Re-submissions (attempt 2, 3, …) link to original; full chain browseable from the latest record.
- [ ] Rejection requires the exact dropdown category + free text reason.
- [ ] All 7 reminders fire correctly (day 6, day 60, day 15, NC overdue, QCI agreement pending day-after, QCI overdue day 7, surveillance 30-day-before).
- [ ] **Process 6 enforced:** TC issuance auto-advances stage; CB-only writes initiation/draft/manufacturer signing; admin-only writes `qciSignedDate`; `qciSignedById` auto-populated; `COMPLETED` advances stage to `POST_TC_SURVEILLANCE`. RLS test + Playwright e2e.
- [ ] Dashboard shows the 8 metrics per CB and overall, plus live TAT panel with overdue red.
- [ ] Registry: search, filter, sort, 100/page, CSV export.
- [ ] Detail: actual vs target TAT once both dates exist; progress bar otherwise.
- [ ] Admins see Delete (soft); CB users do not; public users see only public projection.
- [ ] NABCB-accredited + TC issued → annual surveillance schedule visible.
- [ ] Real-time: new application in browser A appears in browser B within 2 seconds.
- [ ] Deployed; scheduled reminders verified by forced manual run.
- [ ] `README.md`, `RUNBOOK.md`, `DECISIONS.md` present and accurate.

---

## 16. CONFIGURATION

- `APP_NAME` = `csuas-form-d1`
- `DOMAIN` = `tbd.example.com` *(replace with real domain at deploy time)*
- `RESEND_FROM` = `noreply@example.com` *(must match a verified sender in your email service)*
- `ADMIN_BOOTSTRAP_EMAIL` = `guruvayurappan@qcin.org`
- `TIMEZONE` = `Asia/Kolkata`
- `TAT_TARGET_DAYS_TOTAL` = `60`
- `TAT_TARGET_DAYS_DGCA` = `15`
- `TAT_TARGET_DAYS_OBS` = `15`
- `TAT_TARGET_DAYS_QCI_AGREEMENT` = `7`

---

## 17. PROJECT LAYOUT

```
/app                        # Next.js App Router
  /(public)/login
  /(public)/register
  /(app)/dashboard
  /(app)/registry
  /(app)/applications/[id]
  /(app)/applications/new
  /(app)/cb-master          # admin
  /(app)/analytics          # admin
  /(app)/surveillance
  /(app)/settings
  /api/...
/components
/lib                        # backend client, prisma client, auth helpers, tat calculators
/prisma/schema.prisma
/migrations                 # SQL migrations (Supabase or RDS-compatible)
/scheduled                  # reminder function (Supabase Edge or AWS Lambda)
/tests                      # vitest
/e2e                        # playwright
PROMPT.md                   # this file
PLAN.md                     # generated at start; the 17-step checklist
DECISIONS.md                # any deviation, justified
RUNBOOK.md                  # how to deploy, restore, rotate keys
RESUME.md                   # bookmark for the user across sessions
README.md
```

---

## 18. WORKING STYLE FOR CLAUDE CODE

- First action of every session: read `PROMPT.md`, `PLAN.md`, `DECISIONS.md`, `RESUME.md`, `.env.local`. State whether `.env.local` has real credentials. Resume from `RESUME.md`.
- Commit after each step with a message like `Step N: short summary`.
- Run `pnpm typecheck && pnpm test` before each commit.
- If a requirement here conflicts with itself, prefer the stakeholder's wording in §§4–9 — those came from the domain owner.
- Don't invent fields not asked for; do add the audit log, soft delete, and indexes — those are non-negotiable engineering hygiene.
- When unsure between two reasonable choices, pick one, document in `DECISIONS.md`, keep moving.
- **Re-read §1 before starting any new step.**

Begin by writing `PLAN.md` from §14 and `RESUME.md` with "ready to start Step 1". Then wait for the user to say "go".
