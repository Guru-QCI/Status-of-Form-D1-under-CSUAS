-- public_application_timeline: public projection of Application (§4.4)
CREATE OR REPLACE VIEW "public_application_timeline" AS
SELECT
  a."formNumber",
  a."modelName",
  a."modelVariant",
  m."name"                                        AS "manufacturerName",
  cb."name"                                       AS "cbName",
  cb."isNabcbAccredited",
  a."submissionDate",
  CASE WHEN a."reviewDecision" = 'REJECTED'
       THEN NULL
       ELSE a."reviewDecisionDate"
  END                                             AS "reviewDecisionDate",
  a."stage1ScheduleFrom",
  a."stage1ClosureDate",
  a."stage2ScheduleFrom",
  a."stage2ClosureDate",
  a."socSubmittedDate",
  a."tcIssuedDate",
  a."qciAgreementInitiatedDate",
  a."qciAgreementCompletedDate",
  a."currentStage",
  a."status",
  a."qciAgreementStatus",
  a."attemptNumber"
FROM "Application"   a
JOIN "Manufacturer"  m  ON m."id"  = a."manufacturerId"
JOIN "CB"            cb ON cb."id" = a."cbId"
WHERE a."deletedAt" IS NULL;

-- public_surveillance_schedule: planned dates only (§4.4)
CREATE OR REPLACE VIEW "public_surveillance_schedule" AS
SELECT
  sa."applicationId",
  sa."yearOfAudit",
  sa."plannedFrom",
  sa."plannedTo"
FROM "SurveillanceAudit" sa;
