import CalendarView from "../components/calendar/CalendarView";
import type { ReactElement } from "react";

export default function CalendarPage(): ReactElement {
  return (
    <div className="h-full bg-white">
      <CalendarView mode="full" initialView={window.innerWidth < 768 ? "agenda" : "month"} />
    </div>
  );
}
