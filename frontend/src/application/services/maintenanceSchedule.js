const UPCOMING_WINDOW_DAYS = 30;

function toDateOnlyValue(value) {
  if (!value) return null;
  const dateOnly = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

export function getMaintenanceSchedule(dateValue, now = new Date()) {
  const dueDate = toDateOnlyValue(dateValue);
  if (!dueDate) return { status: "UNSCHEDULED", daysRemaining: null };

  const todayValue = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dueValue = Date.parse(`${dueDate}T00:00:00Z`);
  const daysRemaining = Math.round((dueValue - todayValue) / 86400000);

  if (daysRemaining < 0) return { status: "OVERDUE", daysRemaining };
  if (daysRemaining <= UPCOMING_WINDOW_DAYS) return { status: "UPCOMING", daysRemaining };
  return { status: "SCHEDULED", daysRemaining };
}
