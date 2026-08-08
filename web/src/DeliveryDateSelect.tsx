import { DayPicker } from "@daypicker/persian";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { addWorkingDays, persianDate, persianNumber, todayISO } from "./shared";

function dateFromISO(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateToISO(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DeliveryDateSelect({ id, value, onChange, workDays = 0, onWorkDayPick, invalid, describedBy, allowPast = false }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  workDays?: number;
  onWorkDayPick?: (count: number) => void;
  invalid?: boolean;
  describedBy?: string;
  allowPast?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = dateFromISO(value);
  const today = dateFromISO(todayISO())!;
  const endMonth = new Date(today);
  endMonth.setFullYear(endMonth.getFullYear() + 2);
  const promiseDate = workDays > 0 ? addWorkingDays(todayISO(), workDays) : "";

  return (
    <div>
      <button
        id={id}
        className="field flex items-center justify-between gap-3 text-right font-bold"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-controls={`${id}-calendar`}
        aria-describedby={describedBy}
        aria-expanded={open}
        aria-invalid={invalid}
      >
        <span className={selected ? "text-ink" : "text-ink/60"}>{selected ? persianDate(value) : "انتخاب تاریخ"}</span>
        <CalendarDays className="size-5 shrink-0 text-teal" aria-hidden="true" />
      </button>
      {open && (
        <div id={`${id}-calendar`} className="delivery-calendar mt-2 rounded-2xl border border-ledger bg-white p-3 shadow-sm" role="region" aria-label="تقویم تاریخ تحویل">
          <DayPicker
            mode="single"
            captionLayout={allowPast ? "dropdown" : "label"}
            navLayout="after"
            selected={selected}
            defaultMonth={selected ?? today}
            startMonth={allowPast ? undefined : today}
            endMonth={endMonth}
            disabled={allowPast ? undefined : { before: today }}
            onSelect={(day) => {
              if (!day) return;
              onChange(dateToISO(day));
              setOpen(false);
            }}
          />
          {onWorkDayPick && <div className="mt-1 border-t border-ledger px-1 pt-2">
            {workDays > 0 ? (
              <div className="flex min-h-12 items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-ink/50">وعده روز کاری</span>
                  <span className="mt-0.5 block truncate text-xs font-black text-teal" aria-live="polite">{persianDate(promiseDate)}</span>
                </span>
                <span className="flex shrink-0 items-center rounded-xl bg-paper p-0.5 ring-1 ring-inset ring-ink/10" role="group" aria-label="تعداد روز کاری">
                  <button
                    type="button"
                    aria-label="یک روز کاری کمتر"
                    disabled={workDays <= 1}
                    className="grid size-10 place-items-center rounded-[0.65rem] text-lg font-black text-ink transition-colors hover:bg-white disabled:opacity-30"
                    onClick={() => onWorkDayPick(workDays - 1)}
                  >−</button>
                  <span className="min-w-16 text-center text-xs font-black">{persianNumber(workDays)} روز</span>
                  <button
                    type="button"
                    aria-label="یک روز کاری بیشتر"
                    disabled={workDays >= 30}
                    className="grid size-10 place-items-center rounded-[0.65rem] text-lg font-black text-ink transition-colors hover:bg-white disabled:opacity-30"
                    onClick={() => onWorkDayPick(workDays + 1)}
                  >+</button>
                </span>
              </div>
            ) : (
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-center rounded-xl border border-ink/10 bg-paper/60 px-3 text-xs font-bold text-ink/65 transition-colors hover:border-teal/20 hover:text-teal"
                onClick={() => onWorkDayPick(1)}
              >
                تعیین تاریخ بر اساس روز کاری
              </button>
            )}
          </div>}
        </div>
      )}
    </div>
  );
}
