-- Prevent the same athlete from being partner on two active entries in one competition.
CREATE UNIQUE INDEX "CompetitionEntry_competitionId_partnerAthleteId_active_key"
ON "CompetitionEntry" ("competitionId", "partnerAthleteId")
WHERE "status" IN ('PENDING', 'CONFIRMED') AND "partnerAthleteId" IS NOT NULL;
