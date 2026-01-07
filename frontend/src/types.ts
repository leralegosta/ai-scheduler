export type ScheduleBlock = {
  start: string;
  end: string;
  title: string;
  category: "Sleep" | "Health" | "Academics" | "Work" | "Personal";
  fixed?: boolean;
};

export type DailySchedule = {
  date: string;
  blocks: ScheduleBlock[];
};
