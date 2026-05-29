#!/usr/bin/env python3
import argparse
import csv
import json
import sys
import time
import urllib.request


POSITIONS = ["GK", "RB", "CB1", "CB2", "LB", "CDM1", "CDM2", "CAM", "RW", "LW", "ST"]


def load_players(path):
    players = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            players.append({
                "name": row.get("NAME", "").strip(),
                "position": row.get("POSITION", "").strip(),
                "age": row.get("AGE", "").strip(),
                "nationality": row.get("NATIONALITY", "").strip(),
                "club": row.get("CLUB", "").strip(),
                "league": row.get("LEAGUE", "").strip(),
            })
    return [p for p in players if p["name"]]


def filter_candidates(players, use_hints=True):
    by_pos = {"GK": [], "RB": [], "LB": [], "CB": [], "CDM": [], "CAM": [], "RW": [], "LW": [], "ST": []}
    for p in players:
        pos = p["position"]
        if pos in by_pos:
            by_pos[pos].append(p)

    if use_hints:
        # HINT #1: GK is Polish.
        by_pos["GK"] = [p for p in by_pos["GK"] if p["nationality"].lower() == "polish"]
        # HINT #2: ST is Norwegian and plays in the Premier League.
        by_pos["ST"] = [p for p in by_pos["ST"] if p["nationality"].lower() == "norwegian" and p["league"].lower() == "premier league"]
        # HINT #4: CAM is German, Premier League, age 23.
        by_pos["CAM"] = [p for p in by_pos["CAM"] if p["nationality"].lower() == "german" and p["league"].lower() == "premier league" and p["age"] == "23"]
        # Hint from response header: RB is English and plays in La Liga.
        by_pos["RB"] = [p for p in by_pos["RB"] if p["nationality"].lower() == "english" and p["league"].lower() == "la liga"]

    # Map to lineup slots.
    candidates = {
        "GK": [p["name"] for p in by_pos["GK"]],
        "RB": [p["name"] for p in by_pos["RB"]],
        "LB": [p["name"] for p in by_pos["LB"]],
        "CB1": [p["name"] for p in by_pos["CB"]],
        "CB2": [p["name"] for p in by_pos["CB"]],
        "CDM1": [p["name"] for p in by_pos["CDM"]],
        "CDM2": [p["name"] for p in by_pos["CDM"]],
        "CAM": [p["name"] for p in by_pos["CAM"]],
        "RW": [p["name"] for p in by_pos["RW"]],
        "LW": [p["name"] for p in by_pos["LW"]],
        "ST": [p["name"] for p in by_pos["ST"]],
    }

    return candidates


def submit_lineup(base_url, lineup):
    url = base_url.rstrip("/") + "/api/submit"
    payload = json.dumps({"lineup": lineup}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body)


def brute_force(base_url, candidates, max_attempts, sleep_ms):
    attempt = 0
    start = time.time()

    def dfs(idx, used, lineup):
        nonlocal attempt
        if idx == len(POSITIONS):
            attempt += 1
            if max_attempts and attempt > max_attempts:
                return "stop"
            if sleep_ms:
                time.sleep(sleep_ms / 1000.0)
            try:
                res = submit_lineup(base_url, lineup)
            except Exception as exc:
                print(f"Request error: {exc}")
                return "stop"
            if res.get("success"):
                elapsed = time.time() - start
                print(f"SUCCESS after {attempt} attempts in {elapsed:.2f}s")
                print(res.get("flag", ""))
                print(json.dumps(lineup, indent=2))
                return "found"
            if attempt % 200 == 0:
                elapsed = time.time() - start
                print(f"Attempts: {attempt} | {elapsed:.1f}s")
            return None

        pos = POSITIONS[idx]
        for name in candidates.get(pos, []):
            if name in used:
                continue
            lineup[pos] = name
            used.add(name)
            result = dfs(idx + 1, used, lineup)
            used.remove(name)
            lineup.pop(pos, None)
            if result in ("found", "stop"):
                return result
        return None

    return dfs(0, set(), {})


def main():
    parser = argparse.ArgumentParser(description="Brute-force LINEUP CHALLENGE via /api/submit")
    parser.add_argument("--base-url", default="http://localhost:3000", help="Base URL for the challenge")
    parser.add_argument("--players", default="public/players.txt", help="Path to players.txt")
    parser.add_argument("--no-hints", action="store_true", help="Disable built-in hint filters")
    parser.add_argument("--max-attempts", type=int, default=0, help="Stop after N attempts (0 = unlimited)")
    parser.add_argument("--sleep-ms", type=int, default=0, help="Sleep between attempts (ms)")
    args = parser.parse_args()

    players = load_players(args.players)
    candidates = filter_candidates(players, use_hints=not args.no_hints)

    for pos in POSITIONS:
        if not candidates.get(pos):
            print(f"No candidates for {pos}. Try --no-hints or check players.txt")
            sys.exit(1)

    result = brute_force(args.base_url, candidates, args.max_attempts, args.sleep_ms)
    if result != "found":
        print("No solution found.")


if __name__ == "__main__":
    main()
