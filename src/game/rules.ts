export type Side = 0 | 1;

export interface SetScore {
  a: number;
  b: number;
  kind: 'set' | 'matchTiebreak';
}

export interface ScoreSnapshot {
  names: [string, string];
  sets: [number, number];
  games: [number, number];
  points: [string, string];
  server: Side;
  serveNumber: 1 | 2;
  inTiebreak: boolean;
  inMatchTiebreak: boolean;
  tiebreakTarget: number;
  tiebreakPoints: [number, number];
  decidingPoint: boolean;
  setHistory: SetScore[];
  finished: boolean;
  winner: Side | null;
}

export interface PointResolution {
  winner: Side;
  gameWon: boolean;
  setWon: boolean;
  matchWon: boolean;
  call: string;
  snapshot: ScoreSnapshot;
}

const POINT_NAMES = ['0', '15', '30', '40'];

export class TennisMatch {
  names: [string, string];
  sets: [number, number] = [0, 0];
  games: [number, number] = [0, 0];
  points: [number, number] = [0, 0];
  server: Side = 0;
  serveNumber: 1 | 2 = 1;
  inTiebreak = false;
  inMatchTiebreak = false;
  tiebreakPoints: [number, number] = [0, 0];
  setHistory: SetScore[] = [];
  finished = false;
  winner: Side | null = null;
  private tiebreakFirstServer: Side = 0;
  private servedPointsInTiebreak = 0;
  private firstServerThisSet: Side = 0;

  constructor(names: [string, string], firstServer: Side = 0) {
    this.names = names;
    this.server = firstServer;
    this.firstServerThisSet = firstServer;
    this.tiebreakFirstServer = firstServer;
  }

  get decidingPoint(): boolean {
    return !this.inTiebreak && this.points[0] >= 3 && this.points[1] >= 3;
  }

  get serveSide(): 'deuce' | 'ad' {
    if (this.inTiebreak) {
      return this.servedPointsInTiebreak % 2 === 0 ? 'deuce' : 'ad';
    }
    return (this.points[0] + this.points[1]) % 2 === 0 ? 'deuce' : 'ad';
  }

  get receiver(): Side {
    return this.server === 0 ? 1 : 0;
  }

  pointLabel(side: Side): string {
    if (this.inTiebreak || this.inMatchTiebreak) return String(this.tiebreakPoints[side]);
    const own = this.points[side];
    const other = this.points[side === 0 ? 1 : 0];
    if (own >= 3 && other >= 3) return '40';
    return POINT_NAMES[Math.min(3, own)];
  }

  snapshot(): ScoreSnapshot {
    return {
      names: this.names,
      sets: [...this.sets] as [number, number],
      games: [...this.games] as [number, number],
      points: [this.pointLabel(0), this.pointLabel(1)],
      server: this.server,
      serveNumber: this.serveNumber,
      inTiebreak: this.inTiebreak,
      inMatchTiebreak: this.inMatchTiebreak,
      tiebreakTarget: this.inMatchTiebreak ? 10 : 7,
      tiebreakPoints: [...this.tiebreakPoints] as [number, number],
      decidingPoint: this.decidingPoint,
      setHistory: this.setHistory.map((s) => ({ ...s })),
      finished: this.finished,
      winner: this.winner,
    };
  }

  callScore(): string {
    if (this.finished && this.winner !== null) {
      return `GAME, SET AND MATCH, ${this.names[this.winner].toUpperCase()}`;
    }
    if (this.inTiebreak || this.inMatchTiebreak) {
      return `${this.tiebreakPoints[this.server]}–${this.tiebreakPoints[this.server === 0 ? 1 : 0]}`;
    }
    if (this.decidingPoint) return 'DEUCE, DECIDING POINT';
    const serverScore = POINT_NAMES[Math.min(3, this.points[this.server])];
    const receiverScore = POINT_NAMES[Math.min(3, this.points[this.server === 0 ? 1 : 0])];
    return `${serverScore}–${receiverScore}`;
  }

  awardPoint(winner: Side): PointResolution {
    if (this.finished) {
      return this.resolution(winner, false, false, true, this.callScore());
    }
    this.serveNumber = 1;

    if (this.inTiebreak || this.inMatchTiebreak) {
      const target = this.inMatchTiebreak ? 10 : 7;
      this.tiebreakPoints[winner]++;
      this.servedPointsInTiebreak++;
      const w = this.tiebreakPoints[winner];
      const l = this.tiebreakPoints[winner === 0 ? 1 : 0];
      if (w >= target && w - l >= 2) {
        const setWinner = winner;
        const wasMatchTiebreak = this.inMatchTiebreak;
        this.sets[setWinner]++;
        if (wasMatchTiebreak) {
          this.setHistory.push({ a: w, b: l, kind: 'matchTiebreak' });
        } else {
          this.games[setWinner] = 4;
          this.setHistory.push({ a: this.games[0], b: this.games[1], kind: 'set' });
        }
        const matchWon = this.sets[setWinner] >= 2;
        this.finished = matchWon;
        this.winner = matchWon ? setWinner : null;
        this.inTiebreak = false;
        this.inMatchTiebreak = false;
        this.server = this.tiebreakFirstServer === 0 ? 1 : 0;
        this.games = [0, 0];
        this.points = [0, 0];
        this.tiebreakPoints = [0, 0];
        this.servedPointsInTiebreak = 0;
        if (!matchWon) {
          this.startNextSet(setWinner);
        }
        const call = matchWon
          ? `GAME, SET AND MATCH, ${this.names[setWinner].toUpperCase()}`
          : `GAME AND SET, ${this.names[setWinner].toUpperCase()}`;
        return this.resolution(winner, true, true, matchWon, call);
      }
      this.updateTiebreakServer();
      return this.resolution(winner, false, false, false, this.callScore());
    }

    const before0 = this.points[0];
    const before1 = this.points[1];
    this.points[winner]++;
    const wasDeuce = before0 >= 3 && before1 >= 3;
    const w = this.points[winner];
    const l = this.points[winner === 0 ? 1 : 0];
    const gameWon = wasDeuce || (w >= 4 && w - l >= 2);

    if (!gameWon) {
      return this.resolution(winner, false, false, false, this.callScore());
    }

    this.games[winner]++;
    this.points = [0, 0];
    const gameCall = `GAME, ${this.names[winner].toUpperCase()}`;

    if (this.games[winner] >= 4) {
      this.sets[winner]++;
      this.setHistory.push({ a: this.games[0], b: this.games[1], kind: 'set' });
      this.games = [0, 0];
      this.server = this.server === 0 ? 1 : 0;
      const matchWon = this.sets[winner] >= 2;
      this.finished = matchWon;
      this.winner = matchWon ? winner : null;
      if (!matchWon) this.startNextSet(winner);
      return this.resolution(
        winner,
        true,
        true,
        matchWon,
        matchWon ? `GAME, SET AND MATCH, ${this.names[winner].toUpperCase()}` : `GAME AND SET, ${this.names[winner].toUpperCase()}`,
      );
    }

    if (this.games[0] === 3 && this.games[1] === 3) {
      this.inTiebreak = true;
      this.tiebreakFirstServer = this.server === 0 ? 1 : 0;
      this.server = this.tiebreakFirstServer;
      this.servedPointsInTiebreak = 0;
      this.tiebreakPoints = [0, 0];
      return this.resolution(winner, true, false, false, `${gameCall}. TIEBREAK.`);
    }

    this.server = this.server === 0 ? 1 : 0;
    return this.resolution(winner, true, false, false, gameCall);
  }

  private startNextSet(previousSetWinner: Side): void {
    this.games = [0, 0];
    this.points = [0, 0];
    this.inTiebreak = false;
    this.inMatchTiebreak = false;
    this.serveNumber = 1;
    this.tiebreakPoints = [0, 0];
    this.servedPointsInTiebreak = 0;
    this.firstServerThisSet = this.server;
    if (this.sets[0] === 1 && this.sets[1] === 1) {
      this.inMatchTiebreak = true;
      this.tiebreakFirstServer = this.server;
    }
  }

  private updateTiebreakServer(): void {
    const nextPoint = this.servedPointsInTiebreak + 1;
    const first = this.tiebreakFirstServer;
    const second: Side = first === 0 ? 1 : 0;
    this.server = nextPoint % 4 === 1 || nextPoint % 4 === 0 ? first : second;
  }

  private resolution(
    winner: Side,
    gameWon: boolean,
    setWon: boolean,
    matchWon: boolean,
    call: string,
  ): PointResolution {
    return { winner, gameWon, setWon, matchWon, call, snapshot: this.snapshot() };
  }
}

export function rotateLadder(order: string[], winnerId: string, loserId: string): string[] {
  return [winnerId, ...order.filter((id) => id !== winnerId && id !== loserId), loserId];
}

export function displayPoints(points: [string, string]): string {
  return `${points[0]} – ${points[1]}`;
}
