import { describe, expect, it } from 'vitest';
import { rotateLadder, TennisMatch } from '../src/game/rules';

function winGame(match: TennisMatch, side: 0 | 1): ReturnType<TennisMatch['awardPoint']> {
  let result = match.awardPoint(side);
  for (let i = 0; i < 3; i++) {
    if (result.gameWon) break;
    result = match.awardPoint(side);
  }
  return result;
}

describe('tennis scoring', () => {
  it('plays no-ad games and a short set to four', () => {
    const m = new TennisMatch(['A', 'B'], 0);
    for (let i = 0; i < 3; i++) expect(m.awardPoint(0).gameWon).toBe(false);
    expect(m.points).toEqual([3, 0]);
    const game = m.awardPoint(0);
    expect(game.gameWon).toBe(true);
    expect(m.games).toEqual([1, 0]);
    for (let g = 0; g < 3; g++) winGame(m, 0);
    expect(m.sets).toEqual([1, 0]);
    expect(m.games).toEqual([0, 0]);
  });

  it('uses a deciding point at 40-40', () => {
    const m = new TennisMatch(['A', 'B'], 0);
    for (let i = 0; i < 3; i++) m.awardPoint(0);
    for (let i = 0; i < 3; i++) m.awardPoint(1);
    expect(m.decidingPoint).toBe(true);
    expect(m.awardPoint(1).gameWon).toBe(true);
    expect(m.games).toEqual([0, 1]);
  });

  it('starts a tiebreak at 3-3 and awards the set to four games', () => {
    const m = new TennisMatch(['A', 'B'], 0);
    for (let g = 0; g < 3; g++) {
      winGame(m, 0);
      winGame(m, 1);
    }
    expect(m.inTiebreak).toBe(true);
    expect(m.games).toEqual([3, 3]);
    for (let p = 0; p < 7; p++) {
      const r = m.awardPoint(0);
      if (p < 6) expect(r.setWon).toBe(false);
    }
    expect(m.sets).toEqual([1, 0]);
    expect(m.games).toEqual([0, 0]);
    expect(m.inTiebreak).toBe(false);
  });

  it('plays a match tiebreak to ten when sets are 1-1', () => {
    const m = new TennisMatch(['A', 'B'], 0);
    for (let g = 0; g < 4; g++) winGame(m, 0);
    for (let g = 0; g < 4; g++) winGame(m, 1);
    expect(m.sets).toEqual([1, 1]);
    expect(m.inMatchTiebreak).toBe(true);
    for (let p = 0; p < 9; p++) m.awardPoint(0);
    for (let p = 0; p < 9; p++) m.awardPoint(1);
    expect(m.finished).toBe(false);
    m.awardPoint(0);
    m.awardPoint(0);
    expect(m.finished).toBe(true);
    expect(m.sets).toEqual([2, 1]);
    expect(m.winner).toBe(0);
  });

  it('rotates the server after each game', () => {
    const m = new TennisMatch(['A', 'B'], 0);
    expect(m.server).toBe(0);
    winGame(m, 0);
    expect(m.server).toBe(1);
    winGame(m, 1);
    expect(m.server).toBe(0);
  });

  it('keeps the winner first and sends the loser to the back of the ladder', () => {
    expect(rotateLadder(['a', 'b', 'c', 'd'], 'b', 'a')).toEqual(['b', 'c', 'd', 'a']);
    expect(rotateLadder(['a', 'b', 'c', 'd'], 'a', 'b')).toEqual(['a', 'c', 'd', 'b']);
  });
});
