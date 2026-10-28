import { PLAYERS, fullName, type PlayerProfile } from './players';
import type { SetScore } from './rules';

export interface LadderEntry {
  profile: PlayerProfile;
  wins: number;
  losses: number;
}

export interface PlayerCareer {
  id: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
  aces: number;
  doubleFaults: number;
  winners: number;
  errors: number;
}

export interface CareerMatch {
  index: number;
  winnerId: string;
  loserId: string;
  winnerName: string;
  loserName: string;
  score: string;
  sets: SetScore[];
  points: number;
  aces: number;
  doubleFaults: number;
  winners: number;
  errors: number;
  avgRally: number;
  shots: number;
  reasons: Record<string, number>;
}

export interface MatchRecordInput {
  score: string;
  sets: SetScore[];
  winnerSlot: 0 | 1;
  profiles: [PlayerProfile, PlayerProfile];
}

interface LiveMatch {
  index: number;
  points: number;
  rallies: number;
  aces: number;
  doubleFaults: number;
  winners: number;
  errors: number;
  pointsBySlot: [number, number];
  reasons: Record<string, number>;
}

/**
 * In-memory career: the ladder, cumulative player stats and match summaries.
 *
 * Session only by design: reloading the page starts a fresh career. The class
 * has no scene dependency, so the progression rules stay testable.
 */
export class Career {
  ladder: LadderEntry[] = PLAYERS.map((profile) => ({ profile, wins: 0, losses: 0 }));
  readonly matches: CareerMatch[] = [];
  private readonly stats = new Map<string, PlayerCareer>();
  private live: LiveMatch | null = null;

  constructor() {
    for (const profile of PLAYERS) {
      this.stats.set(profile.id, {
        id: profile.id,
        name: fullName(profile),
        matches: 0,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        pointsWon: 0,
        pointsLost: 0,
        aces: 0,
        doubleFaults: 0,
        winners: 0,
        errors: 0,
      });
    }
  }

  get champion(): PlayerProfile {
    return this.ladder[0].profile;
  }

  get challenger(): PlayerProfile {
    return this.ladder[1].profile;
  }

  beginMatch(index: number): void {
    this.live = {
      index,
      points: 0,
      rallies: 0,
      aces: 0,
      doubleFaults: 0,
      winners: 0,
      errors: 0,
      pointsBySlot: [0, 0],
      reasons: {},
    };
  }

  /** Records one finished point. `reason` mirrors the point resolution reason. */
  recordPoint(winner: 0 | 1, reason: string, shots: number): void {
    const live = this.live;
    if (!live) return;
    live.points++;
    live.rallies += Math.max(1, shots);
    live.pointsBySlot[winner]++;
    live.reasons[reason] = (live.reasons[reason] ?? 0) + 1;
    if (reason === 'ACE') live.aces++;
    if (reason === 'DOUBLE FAULT') live.doubleFaults++;
    if (reason === 'WINNER' || reason === 'ACE') live.winners++;
    if (reason === 'OUT' || reason === 'NET' || reason === 'DOUBLE FAULT') live.errors++;
  }

  /** Closes the match, updates the ladder and returns the match summary. */
  finishMatch(input: MatchRecordInput): CareerMatch | null {
    const live = this.live;
    if (!live) return null;
    const winner = input.profiles[input.winnerSlot];
    const loser = input.profiles[input.winnerSlot === 0 ? 1 : 0];
    const winnerEntry = this.ladder.find((entry) => entry.profile.id === winner.id);
    const loserEntry = this.ladder.find((entry) => entry.profile.id === loser.id);
    if (winnerEntry) winnerEntry.wins++;
    if (loserEntry) loserEntry.losses++;

    const winnerStats = this.ensure(winner);
    const loserStats = this.ensure(loser);
    const setsWonBy = (side: 0 | 1): number =>
      input.sets.filter((s) => (side === 0 ? s.a > s.b : s.b > s.a)).length;
    winnerStats.matches++;
    loserStats.matches++;
    winnerStats.wins++;
    loserStats.losses++;
    winnerStats.setsWon += setsWonBy(input.winnerSlot);
    winnerStats.setsLost += setsWonBy(input.winnerSlot === 0 ? 1 : 0);
    loserStats.setsWon += setsWonBy(input.winnerSlot === 0 ? 1 : 0);
    loserStats.setsLost += setsWonBy(input.winnerSlot);
    winnerStats.pointsWon += live.pointsBySlot[input.winnerSlot];
    winnerStats.pointsLost += live.pointsBySlot[input.winnerSlot === 0 ? 1 : 0];
    loserStats.pointsWon += live.pointsBySlot[input.winnerSlot === 0 ? 1 : 0];
    loserStats.pointsLost += live.pointsBySlot[input.winnerSlot];
    winnerStats.aces += live.aces;
    winnerStats.winners += live.winners;
    loserStats.doubleFaults += live.doubleFaults;
    loserStats.errors += live.errors;

    this.ladder = [winner.id, ...this.ladder.filter((e) => e.profile.id !== winner.id && e.profile.id !== loser.id).map((e) => e.profile.id), loser.id]
      .map((id) => this.ladder.find((e) => e.profile.id === id))
      .filter((entry): entry is LadderEntry => Boolean(entry));

    const round = live.points ? live.rallies / live.points : 0;
    const summary: CareerMatch = {
      index: live.index,
      winnerId: winner.id,
      loserId: loser.id,
      winnerName: fullName(winner),
      loserName: fullName(loser),
      score: input.score,
      sets: input.sets.map((s) => ({ ...s })),
      points: live.points,
      aces: live.aces,
      doubleFaults: live.doubleFaults,
      winners: live.winners,
      errors: live.errors,
      avgRally: Math.round(round * 10) / 10,
      shots: live.rallies,
      reasons: { ...live.reasons },
    };
    this.matches.push(summary);
    this.live = null;
    return summary;
  }

  player(id: string): PlayerCareer | null {
    return this.stats.get(id) ?? null;
  }

  playerList(): PlayerCareer[] {
    return [...this.stats.values()];
  }

  get lastMatch(): CareerMatch | null {
    return this.matches.length ? this.matches[this.matches.length - 1] : null;
  }

  private ensure(profile: PlayerProfile): PlayerCareer {
    const existing = this.stats.get(profile.id);
    if (existing) return existing;
    const created: PlayerCareer = {
      id: profile.id,
      name: fullName(profile),
      matches: 0,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      pointsWon: 0,
      pointsLost: 0,
      aces: 0,
      doubleFaults: 0,
      winners: 0,
      errors: 0,
    };
    this.stats.set(profile.id, created);
    return created;
  }
}
