export const dashboardTimeZone = 'Asia/Baghdad';
export type DailyActivity = { date: string; received: number; sent: number };
export type DashboardAnalytics = {
  daily: DailyActivity[];
  conversations: { new: number; inProgress: number; closed: number };
};

export function dashboardDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: dashboardTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function activityDays(rows: DailyActivity[], now = new Date()): DailyActivity[] {
  const today = new Date(`${dashboardDate(now)}T12:00:00Z`);
  const byDate = new Map(rows.map((row) => [row.date, row]));
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today.getTime() - (29 - index) * 86400000).toISOString().slice(0, 10);
    return byDate.get(date) ?? { date, received: 0, sent: 0 };
  });
}
