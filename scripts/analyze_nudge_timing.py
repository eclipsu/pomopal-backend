"""
analyze_nudge_timing.py

Reads a NestJS log file and studies per-user activity patterns
to inform optimal notification hour using a UCB1 bandit simulation.

Usage:
    python analyze_nudge_timing.py --log app.log
    python analyze_nudge_timing.py --log app.log --user c67a5d96-5f97-4645-b904-dcda64662897
"""

import re
import argparse
from collections import defaultdict
from datetime import datetime, timedelta
import json
import math


LOG_PATTERN = re.compile(
    r"\[Nest\]\s+\d+\s+-\s+"
    r"(?P<date>\d{2}/\d{2}/\d{4}),\s+(?P<time>\d+:\d+:\d+\s+(?:AM|PM))"
    r"\s+LOG\s+\[(?P<service>\w+)\]\s+(?P<message>.+)"
)

SESSION_START = re.compile(r"User (?P<uid>[\w-]+) connected")
SESSION_END   = re.compile(r"User (?P<uid>[\w-]+) disconnected")


def parse_log(path: str) -> list[dict]:
    events = []
    with open(path) as f:
        for line in f:
            m = LOG_PATTERN.match(line.strip())
            if not m:
                continue
            dt = datetime.strptime(
                f"{m['date']} {m['time']}", "%m/%d/%Y %I:%M:%S %p"
            )
            events.append({
                "ts": dt,
                "service": m["service"],
                "message": m["message"],
            })
    return events


def extract_sessions(events: list[dict]) -> dict[str, list[dict]]:
    """
    Returns per-user list of sessions: {uid: [{start, end, duration_min}]}
    Unmatched connects (no disconnect seen) are kept with end=None.
    """
    open_sessions: dict[str, datetime] = {}
    sessions: dict[str, list] = defaultdict(list)

    for e in events:
        msg = e["message"]
        m = SESSION_START.search(msg)
        if m:
            open_sessions[m["uid"]] = e["ts"]
            continue
        m = SESSION_END.search(msg)
        if m:
            uid = m["uid"]
            if uid in open_sessions:
                start = open_sessions.pop(uid)
                duration = (e["ts"] - start).total_seconds() / 60
                sessions[uid].append({
                    "start": start,
                    "end": e["ts"],
                    "duration_min": round(duration, 1),
                    "hour": start.hour,
                    "date": start.date(),
                })

    # flush open sessions
    for uid, start in open_sessions.items():
        sessions[uid].append({
            "start": start,
            "end": None,
            "duration_min": None,
            "hour": start.hour,
            "date": start.date(),
        })

    return dict(sessions)


def hourly_activity(sessions: list[dict]) -> dict[int, int]:
    counts = defaultdict(int)
    for s in sessions:
        counts[s["hour"]] += 1
    return dict(counts)


def best_nudge_window(sessions: list[dict], lead_hours: int = 2) -> dict:
    """
    For each session, the 'ideal nudge hour' is `lead_hours` before it started.
    Returns the hour that would have preceded the most sessions.
    """
    nudge_counts = defaultdict(int)
    for s in sessions:
        nudge_hour = (s["hour"] - lead_hours) % 24
        nudge_counts[nudge_hour] += 1
    if not nudge_counts:
        return {}
    best = max(nudge_counts, key=nudge_counts.get)
    return {"best_hour": best, "counts": dict(nudge_counts)}


class UCB1Bandit:
    """
    UCB1 bandit over hours 0-23.
    Reward = 1 if a session started within `window_hours` after the arm (hour) was pulled.
    """

    def __init__(self, window_hours: int = 2):
        self.n_arms = 24
        self.window = window_hours
        self.counts  = [0] * 24
        self.rewards = [0.0] * 24
        self.total   = 0

    def _ucb_score(self, arm: int) -> float:
        if self.counts[arm] == 0:
            return float("inf")
        avg = self.rewards[arm] / self.counts[arm]
        exploration = math.sqrt(2 * math.log(self.total) / self.counts[arm])
        return avg + exploration

    def simulate(self, sessions: list[dict]) -> dict:
        """
        Replay historical sessions as bandit feedback.
        For each day, 'pull' the arm = hour of first session that day,
        reward = 1 if user showed up within window, else 0.
        """
        by_date = defaultdict(list)
        for s in sessions:
            by_date[s["date"]].append(s)

        history = []
        for date in sorted(by_date):
            day_sessions = sorted(by_date[date], key=lambda x: x["start"])
            first = day_sessions[0]
            arm = first["hour"]
            reward = 1 if first["duration_min"] and first["duration_min"] > 5 else 0

            self.total += 1
            self.counts[arm] += 1
            self.rewards[arm] += reward

            history.append({
                "date": str(date),
                "arm_pulled": arm,
                "reward": reward,
                "best_arm_so_far": self.best_arm(),
            })

        return {
            "history": history,
            "final_counts": self.counts,
            "final_rewards": self.rewards,
            "recommended_hour": self.best_arm(),
        }

    def best_arm(self) -> int:
        scored = [(i, self._ucb_score(i)) for i in range(24)]
        return max(scored, key=lambda x: x[1])[0]


def fmt_hour(h: int) -> str:
    return datetime(2000, 1, 1, h).strftime("%-I %p")


def print_report(uid: str, sessions: list[dict], bandit_result: dict):
    print(f"\n{'='*60}")
    print(f"User: {uid}")
    print(f"Total sessions in log: {len(sessions)}")
    print()

    activity = hourly_activity(sessions)
    print("Activity by hour:")
    for hour in sorted(activity):
        bar = "█" * activity[hour]
        print(f"  {fmt_hour(hour):>7}  {bar} ({activity[hour]})")

    nudge = best_nudge_window(sessions)
    if nudge:
        print(f"\nIdeal nudge hour (2h before peak): {fmt_hour(nudge['best_hour'])}")

    rec = bandit_result.get("recommended_hour")
    if rec is not None:
        print(f"UCB1 recommended nudge hour:        {fmt_hour(rec)}")

    print()
    counts  = bandit_result["final_counts"]
    rewards = bandit_result["final_rewards"]
    print("UCB1 arm stats (hour | pulls | reward rate):")
    for h in range(24):
        if counts[h] == 0:
            continue
        rate = rewards[h] / counts[h]
        print(f"  {fmt_hour(h):>7}  pulls={counts[h]}  rate={rate:.0%}")


def main():
    parser = argparse.ArgumentParser(description="Analyze nudge timing from NestJS logs")
    parser.add_argument("--log", required=True, help="Path to log file")
    parser.add_argument("--user", default=None, help="Filter to a specific userId")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    events   = parse_log(args.log)
    sessions = extract_sessions(events)

    if not sessions:
        print("No sessions found in log.")
        return

    users = [args.user] if args.user else list(sessions.keys())

    results = {}
    for uid in users:
        if uid not in sessions:
            print(f"User {uid} not found in log.")
            continue
        user_sessions = sessions[uid]
        bandit = UCB1Bandit(window_hours=2)
        bandit_result = bandit.simulate(user_sessions)

        results[uid] = {
            "sessions": [
                {**s, "start": str(s["start"]), "end": str(s["end"]), "date": str(s["date"])}
                for s in user_sessions
            ],
            "bandit": bandit_result,
        }

        if not args.json:
            print_report(uid, user_sessions, bandit_result)

    if args.json:
        print(json.dumps(results, indent=2, default=str))


if __name__ == "__main__":
    main()