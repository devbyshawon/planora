import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { format, isSameMonth } from "date-fns";
import { taskSlots, slotPreset } from "../../../shared/slots.js";
import { dateKey, asDate, clock, minuteClock } from "../calendar.js";
import { startTaskDrag, acceptTaskDrag, droppedTask } from "../drag.js";
export default function Calendar({
  view,
  days,
  selected,
  today,
  tasks,
  onOpen,
  onCreate,
  onDay,
  use24,
  showGuides,
  categories,
  focusTask,
  onDropTask,
  onToggleCompletion,
}) {
  const scroll = useRef(null);
  const dragging = useRef(false),
    [hover, setHover] = useState(null);
  function beginDrag(event, task) {
    dragging.current = true;
    startTaskDrag(event, task);
  }
  function endDrag() {
    setHover(null);
    setTimeout(() => {
      dragging.current = false;
    }, 0);
  }
  const focused = tasks.find(task => task._id === focusTask?._id);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [view, selected]);
  useEffect(() => {
    if (!scroll.current || !focused || !days.some(day => dateKey(day) === focused.date)) return;
    const element = [...scroll.current.querySelectorAll("[data-task-id]")].find(node => node.dataset.taskId === focused._id);
    if (element) scroll.current.scrollTop += element.getBoundingClientRect().top - scroll.current.getBoundingClientRect().top - 90;
  }, [view, selected, focused?._id, focused?.date, focused?.startMinute, focused?.endMinute]);
  const rangeLabel = row => `${clock(minuteClock(row.startMinute), use24)} – ${clock(minuteClock(row.endMinute), use24)}`;
  function drop(event, date, minute) {
    const id = droppedTask(event);
    if (!id) return;
    event.stopPropagation();
    setHover(null);
    onDropTask(id, date, minute);
  }
  function dropEvents(key, date, minute) {
    return {
      onDragOver: event => { if (acceptTaskDrag(event)) setHover(key); },
      onDragLeave: event => { if (!event.currentTarget.contains(event.relatedTarget)) setHover(null); },
      onDrop: event => drop(event, date, minute),
    };
  }
  const category = (id) =>
    categories.find((c) => c.id === id) || {
      color: "#8891a4",
      name: "Category",
    };
  if (view === "month")
    return (
      <section className="month-view" aria-label="Monthly calendar">
        <div className="month-weekdays">
          {days.slice(0, 7).map((day) => (
            <span key={dateKey(day)}>{format(day, "EEE")}</span>
          ))}
        </div>
        <div
          className="month-grid"
          style={{
            gridTemplateRows: `repeat(${days.length / 7}, minmax(105px,1fr))`,
          }}
        >
          {days.map((day) => {
            const key = dateKey(day),
              dayTasks = tasks.filter((t) => t.date === key);
            return (
              <div
                className={`month-cell ${!isSameMonth(day, asDate(selected)) ? "outside" : ""} ${hover === key ? "drop-target" : ""}`}
                key={key}
                onDragOver={(event) => {
                  if (acceptTaskDrag(event)) setHover(key);
                }}
                onDragLeave={() => setHover(null)}
                onDrop={(event) => {
                  const id = droppedTask(event);
                  setHover(null);
                  if (id) onDropTask(id, key);
                }}
              >
                <button
                  className={`date-number ${key === today ? "today" : ""}`}
                  onClick={() => onDay(key)}
                  aria-label={`Open ${format(day, "MMMM d, yyyy")}`}
                >
                  {format(day, "d")}
                </button>
                <button
                  className="month-add"
                  aria-label={`Add task on ${key}`}
                  onClick={() => onCreate({ date: key })}
                >
                  +
                </button>
                {dayTasks.slice(0, 3).map((task) => (
                  <button
                    className={`month-task ${task.status === "completed" ? "done" : ""}`}
                    key={task._id}
                    draggable
                    onDragStart={(event) => beginDrag(event, task)}
                    onDragEnd={endDrag}
                    onClick={() => {
                      if (!dragging.current) onOpen(task);
                    }}
                    title={`${task.title} · ${clock(task.startTime, use24)}–${clock(task.endTime, use24)} · ${task.durationMinutes} min · ${category(task.category).name} · ${task.priority} priority · ${task.status}${task.notes ? `\n${task.notes}` : ""}`}
                  >
                    <i style={{ background: category(task.category).color }} />
                    <span>
                      {clock(task.startTime, use24)} {task.title}
                    </span>
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <button className="more-button" onClick={() => onDay(key)}>
                    +{dayTasks.length - 3} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  return (
    <section className={`time-calendar custom-slot-calendar ${view === "week" ? "custom-slot-week" : "custom-slot-day-view"} ${showGuides ? "with-guides" : ""}`} aria-label={`${view} calendar`}>
      <div className="custom-slot-caption">
        <b>Custom time slots</b>
        <span>Rows follow your tasks. Each day has its own schedule.</span>
      </div>
      <div className="time-scroll custom-slot-scroll" ref={scroll}>
        <div className="custom-slot-days" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(${days.length === 1 ? "0" : "155px"}, 1fr))` }}>
          {days.map(day => {
            const date = dateKey(day), dayTasks = tasks.filter(task => task.date === date), rows = taskSlots(dayTasks);
            return (
              <section className="custom-slot-day" key={date} aria-label={`Slots for ${format(day, "MMMM d, yyyy")}`} data-date={date}>
                <button className="day-heading custom-slot-day-heading" onClick={() => onDay(date)} aria-label={`Open ${format(day, "MMMM d, yyyy")}`}>
                  <span>{format(day, "EEE")}</span><b className={date === today ? "today" : ""}>{format(day, "d")}</b>
                </button>
                <div className="custom-slot-list">
                  {!dayTasks.length ? (
                    <button className="custom-slot-empty" {...dropEvents(date, date, undefined)} onClick={() => onCreate({ date })} aria-label={`Add a task on ${date}`}>
                      <b>Plan this day</b><span>+ Add a custom slot</span>
                    </button>
                  ) : rows.map(row => {
                    const key = `${date}:${row.startMinute}`, label = rangeLabel(row), overlapping = row.kind === "tasks" && row.tasks.length > 1;
                    if (row.kind === "gap") return (
                      <button key={key} className={`custom-slot-gap ${hover === key ? "drop-target" : ""}`} {...dropEvents(key, date, row.startMinute)} onClick={() => onCreate({ date, ...slotPreset(row.startMinute, row.endMinute) })} aria-label={`Add a slot on ${date} between ${label}`}>
                        <span>{label}</span><b>+ Add slot</b>
                      </button>
                    );
                    return (
                      <div key={key} className={`custom-slot-row ${overlapping ? "has-overlap" : ""} ${hover === key ? "drop-target" : ""}`} data-slot-start={minuteClock(row.startMinute)} data-slot-end={minuteClock(row.endMinute)} {...dropEvents(key, date, row.startMinute)}>
                        <div className="custom-slot-range"><b><time dateTime={minuteClock(row.startMinute)}>{clock(minuteClock(row.startMinute), use24)}</time><span aria-hidden="true">–</span><time dateTime={minuteClock(row.endMinute)}>{clock(minuteClock(row.endMinute), use24)}</time></b><span>{overlapping ? `${row.tasks.length} overlapping slots` : `${row.tasks[0].durationMinutes} min`}</span></div>
                        <div className="custom-slot-track" style={view === "day" ? { height: row.height } : undefined}>
                          {row.tasks.map(task => {
                            const position = view === "day" ? {
                              top: task.top + 4,
                              height: task.height - 8,
                              left: `calc(${task.column * 100 / task.columns}% + 4px)`,
                              width: `calc(${100 / task.columns}% - 8px)`,
                            } : {};
                            return (
                              <div className="custom-slot-item" key={task._id} style={position} data-task-id={task._id} onDrop={event => drop(event, date, task.startMinute)}>
                                <button className={`calendar-task custom-slot-task ${task.status === "completed" ? "done" : ""}`} draggable onDragStart={event => beginDrag(event, task)} onDragEnd={endDrag} onClick={() => { if (!dragging.current) onOpen(task); }} style={{ background: `${category(task.category).color}1a`, borderLeftColor: category(task.category).color }} title={`${task.title} · ${task.startTime}–${task.endTime} (${task.timeZone}) · ${task.durationMinutes} min${task.notes ? `\n${task.notes}` : ""}`} aria-label={`${task.title}, ${clock(task.startTime, use24)} to ${clock(task.endTime, use24)}, ${task.durationMinutes} minutes, ${category(task.category).name}, ${task.priority} priority, ${task.status}`}>
                                  <b>{task.series ? "↻ " : ""}{task.title}</b>
                                  <span className="custom-slot-clock">{clock(task.startTime, use24)} – {clock(task.endTime, use24)}</span>
                                  <small>{category(task.category).name} · {task.priority} · {task.durationMinutes}m</small>
                                  {task.notes && <p className="custom-slot-notes">{task.notes}</p>}
                                </button>
                                <button className="calendar-status custom-slot-status" aria-label={`${task.status === "completed" ? "Mark pending" : "Mark completed"}: ${task.title}`} onClick={() => onToggleCompletion(task)}>{task.status === "completed" && <Check size={12} />}</button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {!!dayTasks.length && <button className="custom-slot-add" onClick={() => onCreate({ date })}>+ Choose other times</button>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
