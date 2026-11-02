import { DateTime } from "luxon";
import { validateRange } from "../../../shared/calendar.js";
import { AppError } from "./errors.js";
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    DateTime.fromISO(value, { zone: "UTC" }).isValid
  );
}
export function scheduleFields(input, timeZone) {
  if (!validDate(input.date))
    throw new AppError(400, "Choose a valid date.", "VALIDATION_ERROR");
  let range;
  try {
    range = validateRange(input.startTime, input.endTime);
  } catch (err) {
    throw new AppError(400, err.message, "VALIDATION_ERROR");
  }
  const start = DateTime.fromISO(`${input.date}T${input.startTime}`, {
    zone: timeZone,
  });
  const end = DateTime.fromISO(`${input.date}T${input.endTime}`, {
    zone: timeZone,
  });
  if (
    !start.isValid ||
    !end.isValid ||
    start.toISODate() !== input.date ||
    end.toISODate() !== input.date ||
    start.toFormat("HH:mm") !== input.startTime ||
    end.toFormat("HH:mm") !== input.endTime
  )
    throw new AppError(
      400,
      "This local time does not exist in your timezone. Choose another time.",
    );
  if (
    start.getPossibleOffsets().length > 1 ||
    end.getPossibleOffsets().length > 1
  )
    throw new AppError(
      400,
      "This time is ambiguous during a clock change. Choose an unambiguous time.",
    );
  return {
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    ...range,
    durationMinutes: Math.round(end.diff(start, "minutes").minutes),
    startsAt: start.toJSDate(),
    endsAt: end.toJSDate(),
    timeZone,
  };
}
