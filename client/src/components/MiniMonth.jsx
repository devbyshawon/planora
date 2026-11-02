import { useEffect, useState } from "react";
import { addMonths, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { asDate, dateKey, visibleDays } from "../calendar.js";

export default function MiniMonth({ selected, today, weekStartsOn, onSelect }) {
  const [month, setMonth] = useState(`${selected.slice(0, 7)}-01`);
  useEffect(() => setMonth(`${selected.slice(0, 7)}-01`), [selected]);
  const days = visibleDays(month, "month", weekStartsOn);
  return (
    <section className="mini-month" aria-labelledby="mini-month-title">
      <div className="mini-month-heading">
        <b id="mini-month-title" aria-live="polite">{format(asDate(month), "MMMM yyyy")}</b>
        <button className="icon-button" aria-label="Previous mini-calendar month" onClick={() => setMonth(dateKey(addMonths(asDate(month), -1)))}><ChevronLeft size={16} /></button>
        <button className="icon-button" aria-label="Next mini-calendar month" onClick={() => setMonth(dateKey(addMonths(asDate(month), 1)))}><ChevronRight size={16} /></button>
      </div>
      <div className="mini-month-grid">
        {days.slice(0, 7).map(day => <span className="mini-weekday" key={dateKey(day)} aria-hidden="true">{format(day, "EEEEE")}</span>)}
        {days.map(day => {
          const key = dateKey(day);
          return <button key={key} className={`${key.slice(0, 7) !== month.slice(0, 7) ? "outside" : ""} ${key === selected ? "selected" : ""}`} aria-label={`Choose ${format(day, "EEEE, MMMM d, yyyy")}`} aria-pressed={key === selected} aria-current={key === today ? "date" : undefined} onClick={() => onSelect(key)}>{format(day, "d")}</button>;
        })}
      </div>
    </section>
  );
}
