import { describe, expect, it } from "vitest";
import {
  FULL_TIME_QUARTERLY_LEAVE_PER_TYPE,
  INTERN_MONTHLY_LEAVE_PER_TYPE,
  MONTHLY_WFH_CREDIT,
  accrualPeriodStarts,
  creditForPeriod,
  isMonthStart,
  isQuarterStart,
  nextPeriodStart,
  periodStartFor,
  roundToHalf,
  toUtcDateOnly,
} from "./leave-rules";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ymd = (date: Date) => date.toISOString().slice(0, 10);

describe("entitlement constants match the design doc", () => {
  it("gives full-time employees 8 of each leave type per year", () => {
    expect(FULL_TIME_QUARTERLY_LEAVE_PER_TYPE * 4).toBe(8);
  });

  it("gives interns 12 of each leave type per year", () => {
    expect(INTERN_MONTHLY_LEAVE_PER_TYPE * 12).toBe(12);
  });

  it("gives everyone 2 WFH days a month", () => {
    expect(MONTHLY_WFH_CREDIT).toBe(2);
  });
});

describe("isMonthStart / isQuarterStart", () => {
  it("detects the 1st of a month", () => {
    expect(isMonthStart(utc("2026-03-01"))).toBe(true);
    expect(isMonthStart(utc("2026-03-02"))).toBe(false);
  });

  it("detects Jan/Apr/Jul/Oct 1st only", () => {
    for (const iso of ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"]) {
      expect(isQuarterStart(utc(iso))).toBe(true);
    }
    for (const iso of ["2026-02-01", "2026-12-01", "2026-04-15"]) {
      expect(isQuarterStart(utc(iso))).toBe(false);
    }
  });
});

describe("periodStartFor", () => {
  it("snaps to the containing month", () => {
    expect(ymd(periodStartFor(utc("2026-06-16"), "monthly"))).toBe("2026-06-01");
    expect(ymd(periodStartFor(utc("2026-06-01"), "monthly"))).toBe("2026-06-01");
  });

  it("snaps to the containing quarter", () => {
    expect(ymd(periodStartFor(utc("2026-02-15"), "quarterly"))).toBe("2026-01-01");
    expect(ymd(periodStartFor(utc("2026-05-20"), "quarterly"))).toBe("2026-04-01");
    expect(ymd(periodStartFor(utc("2026-12-31"), "quarterly"))).toBe("2026-10-01");
  });
});

describe("nextPeriodStart", () => {
  it("advances a month, crossing the year boundary", () => {
    expect(ymd(nextPeriodStart(utc("2026-12-01"), "monthly"))).toBe("2027-01-01");
  });

  it("advances a quarter, crossing the year boundary", () => {
    expect(ymd(nextPeriodStart(utc("2026-10-01"), "quarterly"))).toBe("2027-01-01");
  });
});

describe("roundToHalf", () => {
  it("snaps to the nearest half day", () => {
    expect(roundToHalf(1.2)).toBe(1);
    expect(roundToHalf(1.3)).toBe(1.5);
    expect(roundToHalf(1.74)).toBe(1.5);
    expect(roundToHalf(1.8)).toBe(2);
  });
});

describe("toUtcDateOnly", () => {
  it("strips the time component", () => {
    expect(toUtcDateOnly(new Date("2026-05-20T17:45:31.000Z")).toISOString()).toBe(
      "2026-05-20T00:00:00.000Z"
    );
  });
});

describe("creditForPeriod", () => {
  it("gives the full quarterly amount to someone employed when the quarter opens", () => {
    // Regression: this used to prorate against the quarter that had just ended,
    // handing a Feb joiner 1 day on 1 Apr despite working all of Q2.
    expect(creditForPeriod(2, utc("2026-04-01"), "quarterly", utc("2026-02-15"))).toBe(2);
  });

  it("gives the full monthly amount to someone employed when the month opens", () => {
    expect(creditForPeriod(1, utc("2026-07-01"), "monthly", utc("2026-06-16"))).toBe(1);
  });

  it("gives the full amount when joining exactly on the period start", () => {
    expect(creditForPeriod(2, utc("2026-04-01"), "quarterly", utc("2026-04-01"))).toBe(2);
  });

  it("prorates the quarter the employee joins partway through", () => {
    // Joined 15 Feb, Q1 runs Jan-Mar: 44 of 90 days left -> 2 * 0.489 = 0.978 -> 1
    expect(creditForPeriod(2, utc("2026-01-01"), "quarterly", utc("2026-02-15"))).toBe(1);
  });

  it("prorates the month the employee joins partway through", () => {
    // Joined 16 Jun, June has 30 days, 15 remain -> 1 * 0.5 = 0.5
    expect(creditForPeriod(1, utc("2026-06-01"), "monthly", utc("2026-06-16"))).toBe(0.5);
  });

  it("credits nothing for a period that ended before the employee joined", () => {
    expect(creditForPeriod(2, utc("2026-01-01"), "quarterly", utc("2026-04-01"))).toBe(0);
    expect(creditForPeriod(2, utc("2026-01-01"), "quarterly", utc("2026-08-01"))).toBe(0);
  });

  it("only ever returns whole or half days", () => {
    for (const joinDay of [2, 7, 13, 19, 23, 28]) {
      const amount = creditForPeriod(2, utc("2026-04-01"), "quarterly", utc(`2026-05-${String(joinDay).padStart(2, "0")}`));
      expect(amount % 0.5).toBe(0);
    }
  });
});

describe("accrualPeriodStarts", () => {
  it("lists each quarter from the join quarter to the current one", () => {
    const periods = accrualPeriodStarts(utc("2026-02-15"), utc("2026-07-01"), "quarterly");
    expect(periods.map(ymd)).toEqual(["2026-01-01", "2026-04-01", "2026-07-01"]);
  });

  it("lists each month from the join month to the current one", () => {
    const periods = accrualPeriodStarts(utc("2026-06-16"), utc("2026-08-01"), "monthly");
    expect(periods.map(ymd)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01"]);
  });

  it("does not reach back past the current year, since balances lapse annually", () => {
    const periods = accrualPeriodStarts(utc("2023-05-10"), utc("2026-04-01"), "quarterly");
    expect(periods.map(ymd)).toEqual(["2026-01-01", "2026-04-01"]);
  });

  it("returns the single current period when run on the join date", () => {
    const periods = accrualPeriodStarts(utc("2026-04-01"), utc("2026-04-01"), "quarterly");
    expect(periods.map(ymd)).toEqual(["2026-04-01"]);
  });

  it("catches up every missed month when a run is skipped", () => {
    const periods = accrualPeriodStarts(utc("2026-01-01"), utc("2026-05-01"), "monthly");
    expect(periods).toHaveLength(5);
  });
});

describe("a full-time employee joining mid-quarter, across the year", () => {
  it("gets the partial join quarter plus full credit for every later quarter", () => {
    const joinDate = utc("2026-02-15");
    const periods = accrualPeriodStarts(joinDate, utc("2026-10-01"), "quarterly");
    const amounts = periods.map((p) => creditForPeriod(2, p, "quarterly", joinDate));

    expect(amounts).toEqual([1, 2, 2, 2]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(7);
  });
});
