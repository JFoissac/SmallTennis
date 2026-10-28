import { describe, expect, it } from 'vitest';
import { Career } from '../src/game/career';
import { PLAYERS } from '../src/game/players';

describe('career progression', () => {
  it('starts with a full ladder and empty stats', () => {
    const career = new Career();
    expect(career.ladder).toHaveLength(PLAYERS.length);
    expect(career.champion.id).toBe(PLAYERS[0].id);
    expect(career.playerList().every((p) => p.matches === 0 && p.wins === 0)).toBe(true);
  });

  it('records points, errors and aces', () => {
    const career = new Career();
    career.beginMatch(0);
    career.recordPoint(0, 'ACE', 1);
    career.recordPoint(1, 'OUT', 4);
    career.recordPoint(0, 'WINNER', 7);
    career.recordPoint(1, 'DOUBLE FAULT', 1);
    const match = career.finishMatch({
      score: '2 – 0',
      sets: [
        { a: 4, b: 2, kind: 'set' },
        { a: 4, b: 1, kind: 'set' },
      ],
      winnerSlot: 0,
      profiles: [PLAYERS[0], PLAYERS[1]],
    });
    expect(match).not.toBeNull();
    expect(match!.points).toBe(4);
    expect(match!.aces).toBe(1);
    expect(match!.winners).toBe(2);
    expect(match!.doubleFaults).toBe(1);
    expect(match!.avgRally).toBe(3.3);
  });

  it('moves the winner to the top and the loser to the bottom', () => {
    const career = new Career();
    const challenger = career.challenger;
    career.beginMatch(0);
    career.recordPoint(1, 'WINNER', 3);
    career.finishMatch({
      score: '0 – 2',
      sets: [
        { a: 2, b: 4, kind: 'set' },
        { a: 1, b: 4, kind: 'set' },
      ],
      winnerSlot: 1,
      profiles: [career.champion, challenger],
    });
    expect(career.champion.id).toBe(challenger.id);
    expect(career.ladder[career.ladder.length - 1].profile.id).toBe(PLAYERS[0].id);
  });

  it('accumulates stats across matches and keeps summaries', () => {
    const career = new Career();
    career.beginMatch(0);
    career.recordPoint(0, 'ACE', 1);
    const first = career.finishMatch({
      score: '2 – 0',
      sets: [
        { a: 4, b: 0, kind: 'set' },
        { a: 4, b: 0, kind: 'set' },
      ],
      winnerSlot: 0,
      profiles: [PLAYERS[0], PLAYERS[1]],
    });
    const firstId = first!.winnerId;
    career.beginMatch(1);
    career.recordPoint(0, 'WINNER', 5);
    const second = career.finishMatch({
      score: '2 – 0',
      sets: [
        { a: 4, b: 1, kind: 'set' },
        { a: 4, b: 1, kind: 'set' },
      ],
      winnerSlot: 0,
      profiles: [career.champion, career.challenger],
    });
    expect(career.matches).toHaveLength(2);
    expect(second).not.toBeNull();
    const stats = career.player(firstId);
    expect(stats?.matches).toBe(2);
    expect(stats?.wins).toBe(2);
    expect(stats?.setsWon).toBe(4);
    expect(stats?.pointsWon).toBe(2);
  });
});
