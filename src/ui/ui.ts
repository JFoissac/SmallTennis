import { hexOf } from '../core/palette';
import type { DioramaCamera } from '../core/camera';
import type { ClubWorld } from '../world/world';
import type { MatchGame } from '../game/match';

const ICON_LOB = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12c1-6 4-9 11-9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 2l3 1-1 3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="3" cy="13" r="1.5" fill="currentColor"/></svg>`;
const ICON_DROP = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v9M4.5 7.5L8 11l3.5-3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 14h10" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const ICON_RAIN = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 9a3.5 3.5 0 1 1 1.1-6.8A4.5 4.5 0 0 1 13 6a2.5 2.5 0 0 1-.4 5H4z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 12l-1 2M8 12l-1 2M11 12l-1 2" stroke="currentColor" stroke-width="1.5"/></svg>`;
const ICON_SLIDERS = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" stroke-width="2"/><rect x="5" y="2.5" width="2.5" height="3" fill="currentColor"/><rect x="9" y="6.5" width="2.5" height="3" fill="currentColor"/><rect x="4" y="10.5" width="2.5" height="3" fill="currentColor"/></svg>`;
const ICON_LEFT = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 2L4 8l6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const ICON_RIGHT = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

export class UI {
  private root: HTMLElement;
  private stage: HTMLElement;
  private game: MatchGame;
  private world: ClubWorld;
  private camera: DioramaCamera;
  private elements: Record<string, HTMLElement> = {};
  private signature = '';
  private lastClockMinute = '';
  private viewAccumulator = 0;
  private lastView: ReturnType<MatchGame['getView']> | null = null;
  private lastCall = '';
  private bootDismissed = false;
  private bootTimer = 0;
  private toastText = '';
  private toastTimer = 0;
  private footerHint = '';

  constructor(root: HTMLElement, stage: HTMLElement, game: MatchGame, world: ClubWorld, camera: DioramaCamera) {
    this.root = root;
    this.stage = stage;
    this.game = game;
    this.world = world;
    this.camera = camera;
    this.root.innerHTML = this.template();
    this.cacheElements();
    this.bind();
    this.updateClock();
    window.setTimeout(() => this.dismissBoot(), 3200);
  }

  private template(): string {
    return `
      <div class="hud">
        <div class="hud-top">
          <div class="brand">
            <div class="brand-lockup">
              <span class="brand-ball" aria-hidden="true"></span>
              <span class="brand-name">LOVE ALL</span>
              <span class="brand-clock"><span>CLUB TIME</span><b id="club-clock">--:--</b></span>
            </div>
            <div class="brand-rule"></div>
            <div class="score-panel pixel-panel" aria-label="Match scoreboard">
              <div class="score-top">
                <span class="score-kicker"><i class="live-dot"></i><span id="match-format">SHORT SETS · NO AD</span></span>
                <span class="score-status" id="match-status">SERVE</span>
              </div>
              <div class="score-columns">
                <span></span><span>PLAYER</span><span>SETS</span><span>GAMES</span><span>PTS</span>
              </div>
              <div class="score-row" id="row-0">
                <span class="serve-dot" aria-hidden="true"></span>
                <span class="player-cell"><i class="swatch" id="swatch-0"></i><span class="player-name" id="name-0">—</span></span>
                <span class="score-cell" id="sets-0">0</span>
                <span class="score-cell" id="games-0">0</span>
                <span class="score-cell points" id="points-0">0</span>
              </div>
              <div class="score-row" id="row-1">
                <span class="serve-dot" aria-hidden="true"></span>
                <span class="player-cell"><i class="swatch" id="swatch-1"></i><span class="player-name" id="name-1">—</span></span>
                <span class="score-cell" id="sets-1">0</span>
                <span class="score-cell" id="games-1">0</span>
                <span class="score-cell points" id="points-1">0</span>
              </div>
              <div class="score-footer">
                <span id="serve-readout">LAST SERVE —</span>
                <span id="tiebreak-readout">FIRST SET</span>
              </div>
              <div class="set-strip" id="set-strip"></div>
            </div>
          </div>
          <button class="pixel-button small ladder-toggle" id="ladder-toggle" aria-label="Open the ladder" aria-expanded="false">LADDER</button>
          <aside class="ladder-panel pixel-panel" id="ladder-panel" aria-label="The club ladder">
            <div class="ladder-head"><span>THE LADDER</span><small>WINNER STAYS ON</small></div>
            <ol class="ladder-list" id="ladder-list"></ol>
            <div class="ladder-foot" id="ladder-foot">THE NEXT CHALLENGER STEPS UP</div>
            <div class="ladder-career" id="career-foot">NO MATCH PLAYED YET</div>
          </aside>
        </div>
        <div class="ladder-scrim" id="ladder-scrim"></div>
        <div class="hud-bottom">
          <div class="live-line">
            <span class="live-led" aria-hidden="true"></span>
            <span id="live-status">SERVE</span>
            <span class="hint" id="aim-hint">TAP THE FAR COURT TO AIM THE NEXT SHOT</span>
          </div>
          <div class="bottom-bar" id="bottom-bar">
            <div class="control-group primary-group">
              <span class="group-label">NEXT SHOT</span>
              <button class="pixel-button ctl" data-action="lob" aria-label="Set next shot to a lob" aria-pressed="false">${ICON_LOB}<span>LOB</span></button>
              <button class="pixel-button ctl" data-action="drop" aria-label="Set next shot to a drop shot" aria-pressed="false">${ICON_DROP}<span>DROP</span></button>
              <button class="pixel-button ctl speed-button" data-action="speed" aria-label="Toggle triple speed" aria-pressed="false"><span id="speed-label">×1</span></button>
              <button class="pixel-button ctl" data-action="rain" aria-label="Toggle rain" aria-pressed="false">${ICON_RAIN}<span>RAIN</span></button>
              <button class="pixel-button ctl more-button" data-action="more" aria-label="Show more court controls" aria-expanded="false">${ICON_SLIDERS}<span>MORE</span></button>
            </div>
            <div class="control-group conditions" id="conditions-group">
              <div class="cam-group">
                <button class="pixel-button icon-ctl" data-action="cam-left" aria-label="Turn camera left">${ICON_LEFT}</button>
                <button class="pixel-button icon-ctl" data-action="cam-right" aria-label="Turn camera right">${ICON_RIGHT}</button>
                <button class="pixel-button icon-ctl zoom-ctl" data-action="zoom-out" aria-label="Zoom out">−</button>
                <button class="pixel-button icon-ctl zoom-ctl" data-action="zoom-in" aria-label="Zoom in">+</button>
              </div>
              <div class="seg" data-group="time" aria-label="Time of day">
                <button class="pixel-button tiny" data-time="day" aria-pressed="false">DAY</button>
                <button class="pixel-button tiny" data-time="dusk" aria-pressed="false">DUSK</button>
                <button class="pixel-button tiny" data-time="night" aria-pressed="false">NIGHT</button>
              </div>
              <div class="seg" data-group="surface" aria-label="Court surface">
                <button class="pixel-button tiny" data-surface="clay" aria-pressed="false"><i class="surface-dot clay"></i>CLAY</button>
                <button class="pixel-button tiny" data-surface="grass" aria-pressed="false"><i class="surface-dot grass"></i>GRASS</button>
                <button class="pixel-button tiny" data-surface="hard" aria-pressed="false"><i class="surface-dot hard"></i>HARD</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="umpire-bubble" id="umpire-bubble" aria-live="polite">
        <span class="bubble-label">UMPIRE</span>
        <strong id="umpire-text"></strong>
      </div>
      <div class="game-toast" id="game-toast" role="status"></div>
      <div class="result-overlay" id="result-overlay">
        <div class="result-card pixel-panel">
          <div class="result-kicker">MATCH</div>
          <div class="result-winner" id="result-winner">—</div>
          <div class="result-line" id="result-line">STAYS ON THE LADDER</div>
          <div class="result-next" id="result-next"></div>
        </div>
      </div>
      <div class="boot-screen" id="boot-screen">
        <div class="boot-card">
          <div class="boot-kicker">EST. 1987 · CENTRE COURT</div>
          <h1 class="boot-title">LOVE<br/>ALL</h1>
          <div class="boot-ball" aria-hidden="true"></div>
          <div class="boot-sub">A SMALL TENNIS CLUB<br/>ON A FLOATING ISLAND</div>
          <div class="boot-meta">SHORT SETS · NO AD · WINNER STAYS ON</div>
          <button class="pixel-button cream boot-start" id="boot-start">TAKE A SEAT</button>
          <div class="boot-hint">TAP THE FAR COURT TO COACH THE NEXT SHOT</div>
        </div>
      </div>
    `;
  }

  private cacheElements(): void {
    const ids = [
      'club-clock', 'match-status', 'serve-readout', 'tiebreak-readout', 'set-strip',
      'ladder-list', 'ladder-foot', 'ladder-toggle', 'ladder-panel', 'ladder-scrim', 'career-foot',
      'live-status', 'aim-hint', 'umpire-bubble', 'umpire-text', 'game-toast',
      'result-overlay', 'result-winner', 'result-line', 'result-next', 'boot-screen',
      'boot-start', 'speed-label', 'conditions-group', 'bottom-bar', 'match-format',
    ];
    for (const id of ids) this.elements[id] = document.getElementById(id)!;
    for (let i = 0; i < 2; i++) {
      this.elements[`row-${i}`] = document.getElementById(`row-${i}`)!;
      this.elements[`name-${i}`] = document.getElementById(`name-${i}`)!;
      this.elements[`swatch-${i}`] = document.getElementById(`swatch-${i}`)!;
      this.elements[`sets-${i}`] = document.getElementById(`sets-${i}`)!;
      this.elements[`games-${i}`] = document.getElementById(`games-${i}`)!;
      this.elements[`points-${i}`] = document.getElementById(`points-${i}`)!;
    }
  }

  private bind(): void {
    this.stage.addEventListener('pointerdown', (event) => {
      if (!this.bootDismissed) return;
      const target = event.target as HTMLElement;
      if (target.closest('button')) return;
      const rect = this.stage.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((((event.clientY - rect.top) / rect.height) * 2) - 1);
      this.game.setAimFromNdc(nx, ny);
    });

    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'lob') this.game.toggleForcedShot('lob');
      else if (action === 'drop') this.game.toggleForcedShot('drop');
      else if (action === 'speed') this.game.toggleSpeed();
      else if (action === 'rain') this.game.setRain(!this.game.isRainy);
      else if (action === 'cam-left') this.camera.rotateQuarter(-1);
      else if (action === 'cam-right') this.camera.rotateQuarter(1);
      else if (action === 'zoom-in') this.camera.zoomBy(0.15);
      else if (action === 'zoom-out') this.camera.zoomBy(-0.15);
      else if (action === 'more') {
        const expanded = this.elements['bottom-bar'].classList.toggle('show-conditions');
        button.setAttribute('aria-expanded', String(expanded));
      }
      const time = button.dataset.time;
      if (time === 'day' || time === 'dusk' || time === 'night') this.game.setTime(time);
      const surface = button.dataset.surface;
      if (surface === 'clay' || surface === 'grass' || surface === 'hard') this.game.setSurface(surface);
      if ((event.target as HTMLElement).closest('#boot-start')) this.dismissBoot();
    });

    this.elements['ladder-scrim'].addEventListener('click', () => this.closeLadder());

    this.stage.addEventListener('wheel', (event) => {
      if (!this.bootDismissed) return;
      event.preventDefault();
      this.camera.zoomBy(event.deltaY < 0 ? 0.1 : -0.1);
    }, { passive: false });

    this.elements['boot-screen'].addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('#boot-start') || target.closest('.boot-card')) return;
      this.dismissBoot();
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeLadder();
        this.dismissBoot();
      }
      if (event.key === 'ArrowLeft') this.camera.rotateQuarter(-1);
      if (event.key === 'ArrowRight') this.camera.rotateQuarter(1);
      if (event.key === '1') this.game.toggleForcedShot('lob');
      if (event.key === '2') this.game.toggleForcedShot('drop');
      if (event.key === ' ') {
        event.preventDefault();
        this.game.toggleSpeed();
      }
    });

    const ladderToggle = this.elements['ladder-toggle'];
    ladderToggle.addEventListener('click', () => this.toggleLadder());
    this.elements['ladder-scrim'].addEventListener('click', () => this.closeLadder());
  }

  private toggleLadder(): void {
    const open = this.elements['ladder-panel'].classList.toggle('open');
    this.elements['ladder-toggle'].setAttribute('aria-expanded', String(open));
    this.elements['ladder-scrim'].classList.toggle('show', open);
  }

  private closeLadder(): void {
    this.elements['ladder-panel'].classList.remove('open');
    this.elements['ladder-toggle'].setAttribute('aria-expanded', 'false');
    this.elements['ladder-scrim'].classList.remove('show');
  }

  dismissBoot(): void {
    if (this.bootDismissed) return;
    this.bootDismissed = true;
    this.elements['boot-screen'].classList.add('gone');
    this.elements['boot-screen'].setAttribute('aria-hidden', 'true');
  }

  update(dt: number, realElapsed: number): void {
    this.viewAccumulator += dt;
    if (this.lastView && this.viewAccumulator < 0.1) return;
    this.viewAccumulator = 0;
    this.updateClock();
    const view = this.game.getView();
    this.lastView = view;
    const signature = [
      view.score.names.join('|'), view.score.sets.join(','), view.score.games.join(','),
      view.score.points.join(','), view.score.server, view.score.serveNumber, view.score.inTiebreak,
      view.score.inMatchTiebreak, view.score.decidingPoint, view.score.finished, view.serveSpeed,
      view.status, view.players.map((p) => `${p.id}:${p.initials}`).join(','),
      view.ladder.map((l) => `${l.id}:${l.wins}:${l.losses}:${l.status}:${l.active}`).join(','),
      view.career.matches,
      view.career.lastMatch ? `${view.career.lastMatch.index}:${view.career.lastMatch.score}` : '',
      view.forced, view.aim ? `${view.aim.x.toFixed(1)},${view.aim.z.toFixed(1)}` : '',
      view.speed, view.rain, view.covered, view.surface, view.timeMode,
    ].join('~');
    if (signature !== this.signature) {
      this.signature = signature;
      this.updateScoreboard(view);
      this.updateLadder(view);
      this.updateStatus(view);
      this.updateControls(view);
      this.updateAimHint(view);
    }
    this.updateCall(view);
    this.updateToast(view);
    this.updateResult(view);
  }

  private updateClock(): void {
    const now = new Date();
    const text = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (text !== this.lastClockMinute) {
      this.lastClockMinute = text;
      this.elements['club-clock'].textContent = text;
    }
  }

  private updateScoreboard(view: ReturnType<MatchGame['getView']>): void {
    const score = view.score;
    for (let i = 0; i < 2; i++) {
      const player = view.players[i];
      this.elements[`name-${i}`].textContent = score.names[i];
      this.elements[`swatch-${i}`].style.background = player ? hexOf(player.shirt) : '#fff6e0';
      this.elements[`sets-${i}`].textContent = String(score.sets[i]);
      this.elements[`games-${i}`].textContent = String(score.games[i]);
      this.elements[`points-${i}`].textContent = score.points[i];
      const row = this.elements[`row-${i}`];
      row.classList.toggle('serving', score.server === i);
      row.classList.toggle('winner', score.finished && score.winner === i);
    }
    this.elements['match-format'].textContent = score.inMatchTiebreak
      ? 'MATCH TIEBREAK · TO 10'
      : score.inTiebreak
        ? 'TIEBREAK · TO 7'
        : 'SHORT SETS · NO AD';
    this.elements['serve-readout'].textContent = view.serveSpeed > 0
      ? `LAST SERVE ${view.serveSpeed} KM/H · ${view.score.serveNumber === 2 ? '2ND' : '1ST'}`
      : 'LAST SERVE —';
    const setNumber = score.setHistory.filter((s) => s.kind === 'set').length + (score.inMatchTiebreak ? 1 : 0);
    let tb = '';
    if (score.inMatchTiebreak) tb = 'MATCH TIEBREAK · TO 10';
    else if (score.inTiebreak) tb = 'TIEBREAK · TO 7';
    else if (score.decidingPoint) tb = 'DECIDING POINT · NO AD';
    else if (score.finished) tb = 'FINAL';
    else tb = `SET ${Math.min(3, setNumber + 1)} · BEST OF 3`;
    this.elements['tiebreak-readout'].textContent = tb;
    const strip = this.elements['set-strip'];
    const history = score.setHistory;
    strip.innerHTML = history.length
      ? history.map((s) => `<span class="set-chip ${s.kind === 'matchTiebreak' ? 'tb' : ''}"><b>${s.a}</b>–<b>${s.b}</b></span>`).join('<i class="set-sep"></i>')
      : '<span class="set-empty">BEST OF THREE · WINNER STAYS ON</span>';
    this.elements['match-status'].textContent = view.status;
  }

  private updateLadder(view: ReturnType<MatchGame['getView']>): void {
    const list = this.elements['ladder-list'];
    list.innerHTML = view.ladder.map((entry, i) => {
      const tag = entry.status === 'champion' ? 'CHAMP' : entry.status === 'challenger' ? 'NEXT' : '';
      return `<li class="ladder-row ${entry.status} ${entry.active ? 'active' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="who"><b>${escapeHtml(entry.name)}</b><small>${escapeHtml(entry.nickname)}</small></span>
        <span class="rec">${entry.wins}–${entry.losses}</span>
        <span class="ladder-tag">${tag}</span>
      </li>`;
    }).join('');
    const next = view.ladder[1];
    this.elements['ladder-foot'].textContent = next
      ? `NEXT UP · ${next.name.toUpperCase()}`
      : 'THE NEXT CHALLENGER STEPS UP';
    const last = view.career.lastMatch;
    this.elements['career-foot'].textContent = last
      ? `TOUR ${view.career.matches} · LAST ${last.winnerName.toUpperCase()} ${last.score}`
      : 'NO MATCH PLAYED YET';
    const stats = view.career.players;
    [...list.querySelectorAll('.ladder-row')].forEach((row, i) => {
      const entry = view.ladder[i];
      const stat = stats.find((s) => s.id === entry.id);
      if (stat) {
        row.setAttribute(
          'title',
          `${stat.matches} ${stat.matches === 1 ? 'match' : 'matches'} · ${stat.setsWon}–${stat.setsLost} sets · ${stat.pointsWon} pts · ${stat.aces} aces`,
        );
      }
    });
  }

  private updateStatus(view: ReturnType<MatchGame['getView']>): void {
    this.elements['live-status'].textContent = view.status;
    this.elements['aim-hint'].textContent = this.aimHintFor(view);
    this.elements['match-status'].textContent = view.status;
  }

  private updateControls(view: ReturnType<MatchGame['getView']>): void {
    const lob = this.root.querySelector('[data-action="lob"]') as HTMLButtonElement;
    const drop = this.root.querySelector('[data-action="drop"]') as HTMLButtonElement;
    const speed = this.root.querySelector('[data-action="speed"]') as HTMLButtonElement;
    const rain = this.root.querySelector('[data-action="rain"]') as HTMLButtonElement;
    lob.classList.toggle('on', view.forced === 'lob');
    drop.classList.toggle('on', view.forced === 'drop');
    lob.setAttribute('aria-pressed', String(view.forced === 'lob'));
    drop.setAttribute('aria-pressed', String(view.forced === 'drop'));
    speed.classList.toggle('on', view.speed === 3);
    speed.setAttribute('aria-pressed', String(view.speed === 3));
    this.elements['speed-label'].textContent = view.speed === 3 ? '×3' : '×1';
    rain.classList.toggle('on', view.rain);
    rain.setAttribute('aria-pressed', String(view.rain));
    const timeGroup = this.root.querySelector('[data-group="time"]');
    timeGroup?.querySelectorAll('button').forEach((b) => {
      const active = (b as HTMLElement).dataset.time === view.timeMode;
      b.classList.toggle('on', active);
      b.setAttribute('aria-pressed', String(active));
    });
    const surfaceGroup = this.root.querySelector('[data-group="surface"]');
    surfaceGroup?.querySelectorAll('button').forEach((b) => {
      const active = (b as HTMLElement).dataset.surface === view.surface;
      b.classList.toggle('on', active);
      b.setAttribute('aria-pressed', String(active));
    });
    this.elements['conditions-group'].classList.toggle('rainy', view.rain);
  }

  private updateAimHint(view: ReturnType<MatchGame['getView']>): void {
    this.elements['aim-hint'].textContent = this.aimHintFor(view);
  }

  private aimHintFor(view: ReturnType<MatchGame['getView']>): string {
    if (view.covered) return 'COVER ON · THE CLUB WAITS';
    if (view.status.includes('SET BREAK') || view.status.includes('MATCH')) return 'THE LADDER IS MOVING';
    if (view.forced === 'lob' && view.aim) return 'NEXT SHOT · LOB · AIM LOCKED';
    if (view.forced === 'drop' && view.aim) return 'NEXT SHOT · DROP · AIM LOCKED';
    if (view.forced === 'lob') return 'NEXT SHOT · LOB · TAP A TARGET';
    if (view.forced === 'drop') return 'NEXT SHOT · DROP · TAP A TARGET';
    if (view.aim) return 'TARGET LOCKED · TAP TO MOVE IT';
    return 'TAP THE FAR COURT TO AIM THE NEXT SHOT';
  }

  private updateCall(view: ReturnType<MatchGame['getView']>): void {
    const bubble = this.elements['umpire-bubble'];
    if (!view.call) {
      if (this.lastCall) {
        this.lastCall = '';
        bubble.classList.remove('show');
      }
      return;
    }
    if (view.call !== this.lastCall) {
      this.lastCall = view.call;
      this.elements['umpire-text'].textContent = view.call;
      bubble.classList.add('show');
    }
    const stageRect = this.stage.getBoundingClientRect();
    const anchor = this.game.umpireAnchor;
    const projected = this.camera.screenPosition(anchor, stageRect.width, stageRect.height);
    const x = Math.max(120, Math.min(stageRect.width - 120, projected.x));
    const y = Math.max(96, Math.min(stageRect.height - 160, projected.y));
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
  }

  private updateToast(view: ReturnType<MatchGame['getView']>): void {
    const toast = this.elements['game-toast'];
    if (!view.toast) {
      this.toastText = '';
      toast.classList.remove('show');
      return;
    }
    if (view.toast !== this.toastText) {
      this.toastText = view.toast;
      toast.textContent = view.toast;
      toast.classList.add('show');
    }
  }

  private updateResult(view: ReturnType<MatchGame['getView']>): void {
    const overlay = this.elements['result-overlay'];
    if (!view.result) {
      overlay.classList.remove('show');
      return;
    }
    overlay.classList.add('show');
    this.elements['result-winner'].textContent = view.result.winnerName;
    this.elements['result-line'].textContent = `STAYS ON · ${view.result.score} SETS`;
    this.elements['result-next'].textContent = view.result.nextName ? `NEXT CHALLENGER · ${view.result.nextName.toUpperCase()}` : '';
  }
}
