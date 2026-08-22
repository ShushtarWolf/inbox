-- Prevent concurrent coach bookings for the same coach/time while an active session exists.
-- Cancelled sessions may reuse the slot.
CREATE UNIQUE INDEX "CoachSession_coachId_date_startTime_active_key"
ON "CoachSession" ("coachId", "date", "startTime")
WHERE status <> 'CANCELLED';
