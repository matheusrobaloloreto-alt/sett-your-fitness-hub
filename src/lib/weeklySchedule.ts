export const WEEKLY_SCHEDULE_DAYS = [
  { key: "monday", label: "Segunda", serializedLabel: "segunda" },
  { key: "tuesday", label: "Terça", serializedLabel: "terça" },
  { key: "wednesday", label: "Quarta", serializedLabel: "quarta" },
  { key: "thursday", label: "Quinta", serializedLabel: "quinta" },
  { key: "friday", label: "Sexta", serializedLabel: "sexta" },
  { key: "saturday", label: "Sábado", serializedLabel: "sábado" },
  { key: "sunday", label: "Domingo", serializedLabel: "domingo" },
] as const;

export type WeeklyScheduleDayKey = (typeof WEEKLY_SCHEDULE_DAYS)[number]["key"];
export type WeeklyScheduleValues = Record<WeeklyScheduleDayKey, string>;

const EMPTY_WEEKLY_SCHEDULE: WeeklyScheduleValues = {
  monday: "",
  tuesday: "",
  wednesday: "",
  thursday: "",
  friday: "",
  saturday: "",
  sunday: "",
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase();

const DAY_KEY_BY_LABEL = new Map(
  WEEKLY_SCHEDULE_DAYS.map((day) => [normalize(day.serializedLabel), day.key]),
);

export function parseWeeklySchedule(serialized: string): WeeklyScheduleValues {
  const values = { ...EMPTY_WEEKLY_SCHEDULE };

  for (const segment of serialized.split(/[;\n|]+/)) {
    const match = segment.match(/^\s*([^—\-:]+?)\s*(?:—|-|:)\s*(.*?)\s*$/);
    if (!match) continue;
    const key = DAY_KEY_BY_LABEL.get(normalize(match[1]));
    if (key) values[key] = match[2].trim();
  }

  return values;
}

export function serializeWeeklySchedule(values: WeeklyScheduleValues): string {
  return WEEKLY_SCHEDULE_DAYS
    .map((day) => {
      const value = values[day.key].trim().replace(/[;\n|]+/g, ", ");
      return value ? `${day.serializedLabel} — ${value}` : "";
    })
    .filter(Boolean)
    .join("; ");
}

export function updateWeeklySchedule(
  serialized: string,
  dayKey: WeeklyScheduleDayKey,
  value: string,
): string {
  return serializeWeeklySchedule({
    ...parseWeeklySchedule(serialized),
    [dayKey]: value,
  });
}

export function missingWeeklyScheduleDays(serialized: string): string[] {
  const values = parseWeeklySchedule(serialized);
  return WEEKLY_SCHEDULE_DAYS
    .filter((day) => !values[day.key].trim())
    .map((day) => day.label);
}
