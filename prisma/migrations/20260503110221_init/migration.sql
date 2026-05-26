-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CB_USER', 'PUBLIC');

-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('APPLICATION_REVIEW', 'STAGE_1', 'STAGE_2', 'TECHNICAL_REVIEW_SOC', 'DGCA_REVIEW', 'TC_ISSUED', 'QCI_AGREEMENT', 'POST_TC_SURVEILLANCE');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('IN_PROGRESS', 'REJECTED', 'TC_ISSUED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RejectionCategory" AS ENUM ('EXCEEDS_60_DAYS', 'INSUFFICIENT_DOCUMENTS', 'NO_RESPONSE_TO_NCS', 'OTHER');

-- CreateEnum
CREATE TYPE "QciAgreementStatus" AS ENUM ('NOT_STARTED', 'INITIATED', 'MANUFACTURER_SIGNED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('FORM_D1', 'TECHNICAL_FILE', 'TEST_REPORT', 'CRM_DOCUMENT', 'NC_CLOSURE_EVIDENCE', 'SOC', 'TYPE_CERTIFICATE', 'QCI_MANUFACTURER_AGREEMENT_DRAFT', 'QCI_MANUFACTURER_AGREEMENT_SIGNED', 'SURVEILLANCE_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('CB_DECISION_DAY_6', 'PROCESS_1_TO_4_DAY_60', 'DGCA_REVIEW_DAY_15', 'NC_RESPONSE_OVERDUE', 'QCI_AGREEMENT_PENDING', 'QCI_AGREEMENT_OVERDUE', 'SURVEILLANCE_DUE');

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "cbId" TEXT,
    "designation" TEXT,
    "organisation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CB" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isNabcbAccredited" BOOLEAN NOT NULL DEFAULT false,
    "nabcbExpiryDate" TIMESTAMP(3),
    "contactPersonName" TEXT,
    "contactDesignation" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,

    CONSTRAINT "CB_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "formNumber" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVariant" TEXT,
    "cbId" TEXT NOT NULL,
    "submissionDate" TIMESTAMP(3) NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "parentApplicationId" TEXT,
    "currentStage" "Stage" NOT NULL DEFAULT 'APPLICATION_REVIEW',
    "status" "AppStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "reviewerName" TEXT,
    "reviewerDesignation" TEXT,
    "reviewerOrg" TEXT,
    "reviewDecisionDate" TIMESTAMP(3),
    "reviewDecision" "ReviewDecision",
    "rejectionCategory" "RejectionCategory",
    "rejectionReason" TEXT,
    "stage1ScheduleFrom" TIMESTAMP(3),
    "stage1ScheduleTo" TIMESTAMP(3),
    "stage1ClosureDate" TIMESTAMP(3),
    "stage2ScheduleFrom" TIMESTAMP(3),
    "stage2ScheduleTo" TIMESTAMP(3),
    "stage2ClosureDate" TIMESTAMP(3),
    "socReviewDate" TIMESTAMP(3),
    "socSubmittedDate" TIMESTAMP(3),
    "dgcaReviewStartedAt" TIMESTAMP(3),
    "tcIssuedDate" TIMESTAMP(3),
    "qciAgreementStatus" "QciAgreementStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "qciAgreementInitiatedDate" TIMESTAMP(3),
    "qciAgreementDraftSentDate" TIMESTAMP(3),
    "manufacturerSignedDate" TIMESTAMP(3),
    "qciSignedDate" TIMESTAMP(3),
    "qciSignedById" TEXT,
    "qciAgreementCompletedDate" TIMESTAMP(3),
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "DocType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvaluator" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "evaluatorName" TEXT NOT NULL,
    "competencyClauses" TEXT[],

    CONSTRAINT "ApplicationEvaluator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonConformity" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "iteration" INTEGER NOT NULL,
    "raisedDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "crmStoragePath" TEXT,
    "manufacturerResponseDate" TIMESTAMP(3),
    "closureEvidencePath" TEXT,
    "closedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NonConformity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DgcaObservation" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL,
    "raisedDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "cbResponseDate" TIMESTAMP(3),
    "resolvedDate" TIMESTAMP(3),

    CONSTRAINT "DgcaObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveillanceAudit" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "yearOfAudit" INTEGER NOT NULL,
    "plannedFrom" TIMESTAMP(3) NOT NULL,
    "plannedTo" TIMESTAMP(3) NOT NULL,
    "actualFrom" TIMESTAMP(3),
    "actualTo" TIMESTAMP(3),
    "outcome" TEXT,
    "reportPath" TEXT,

    CONSTRAINT "SurveillanceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "recipients" TEXT[],
    "message" TEXT NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CB_name_key" ON "CB"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Application_formNumber_key" ON "Application"("formNumber");

-- CreateIndex
CREATE INDEX "Application_cbId_idx" ON "Application"("cbId");

-- CreateIndex
CREATE INDEX "Application_manufacturerId_idx" ON "Application"("manufacturerId");

-- CreateIndex
CREATE INDEX "Application_currentStage_idx" ON "Application"("currentStage");

-- CreateIndex
CREATE INDEX "Application_submissionDate_idx" ON "Application"("submissionDate");

-- CreateIndex
CREATE INDEX "Application_tcIssuedDate_idx" ON "Application"("tcIssuedDate");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_applicationId_kind_dueAt_key" ON "Reminder"("applicationId", "kind", "dueAt");

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_cbId_fkey" FOREIGN KEY ("cbId") REFERENCES "CB"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_cbId_fkey" FOREIGN KEY ("cbId") REFERENCES "CB"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_parentApplicationId_fkey" FOREIGN KEY ("parentApplicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_qciSignedById_fkey" FOREIGN KEY ("qciSignedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvaluator" ADD CONSTRAINT "ApplicationEvaluator_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformity" ADD CONSTRAINT "NonConformity_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DgcaObservation" ADD CONSTRAINT "DgcaObservation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveillanceAudit" ADD CONSTRAINT "SurveillanceAudit_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
