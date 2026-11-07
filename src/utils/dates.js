function parseDateOnly(value) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? 6 : day - 1;
  next.setDate(next.getDate() - diff);
  return next;
}

function resolveRange({ preset = "month", startDate, endDate } = {}) {
  const now = new Date();
  const key = String(preset || "month").toLowerCase();

  if (key === "today") {
    return { preset: "today", start: startOfDay(now), end: endOfDay(now) };
  }

  if (key === "week") {
    const start = startOfWeek(now);
    const end = endOfDay(new Date(start));
    end.setDate(start.getDate() + 6);
    return { preset: "week", start, end };
  }

  if (key === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return { preset: "month", start, end };
  }

  if (key === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = endOfDay(new Date(now.getFullYear(), 11, 31));
    return { preset: "year", start, end };
  }

  if (key === "custom") {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);

    if (!start || !end) {
      return { error: "Custom range requires a valid start date and end date" };
    }

    const rangeStart = startOfDay(start);
    const rangeEnd = endOfDay(end);

    if (rangeStart > rangeEnd) {
      return { error: "Start date cannot be after end date" };
    }

    return { preset: "custom", start: rangeStart, end: rangeEnd };
  }

  return { error: "Date range must be today, week, month, year, or custom" };
}

function trendUnit(start, end) {
  const days = (end.getTime() - start.getTime()) / 86400000;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

module.exports = {
  parseDateOnly,
  startOfDay,
  endOfDay,
  resolveRange,
  trendUnit,
};
