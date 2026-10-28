import { C } from '../core/palette';

export interface PlayerStats {
  speed: number;
  consistency: number;
  power: number;
  topspin: number;
  slice: number;
  net: number;
  variety: number;
  serve: number;
  stamina: number;
}

export interface PlayerProfile {
  id: string;
  name: string;
  surname: string;
  nickname: string;
  style: string;
  bio: string;
  height: number;
  leftHanded: boolean;
  oneHandedBackhand: boolean;
  look: {
    shirt: number;
    shorts: number;
    skin: number;
    hair: number;
    shoe: number;
    headband: number;
    accent: number;
    racket: number;
  };
  stats: PlayerStats;
}

export const PLAYERS: PlayerProfile[] = [
  {
    id: 'voss',
    name: 'Mara',
    surname: 'Voss',
    nickname: 'The Grinder',
    style: 'CLAY COURT SPECIALIST',
    bio: 'Heavy topspin, relentless legs. Keeps the ball deep and waits for the short one.',
    height: 1.74,
    leftHanded: false,
    oneHandedBackhand: false,
    look: {
      shirt: C.cream,
      shorts: C.clay,
      skin: C.skinLight,
      hair: C.umber,
      shoe: C.paper,
      headband: C.mustard,
      accent: C.roof,
      racket: C.mustard,
    },
    stats: { speed: 7.2, consistency: 0.92, power: 0.78, topspin: 0.9, slice: 0.28, net: 0.35, variety: 0.38, serve: 0.68, stamina: 0.96 },
  },
  {
    id: 'park',
    name: 'Jun',
    surname: 'Park',
    nickname: 'The Wall',
    style: 'COUNTERPUNCHER',
    bio: 'Returns everything. Two-handed backhand, flat feet, infinite patience.',
    height: 1.79,
    leftHanded: false,
    oneHandedBackhand: false,
    look: {
      shirt: C.teal,
      shorts: C.bone,
      skin: C.skinMid,
      hair: C.ink,
      shoe: C.cream,
      headband: C.hard,
      accent: C.paleAqua,
      racket: C.cream,
    },
    stats: { speed: 7.8, consistency: 0.96, power: 0.7, topspin: 0.68, slice: 0.42, net: 0.3, variety: 0.34, serve: 0.62, stamina: 0.92 },
  },
  {
    id: 'reyes',
    name: 'Sofia',
    surname: 'Reyes',
    nickname: 'The Artist',
    style: 'ALL-COURT SHOTMAKER',
    bio: 'Drop shots, lobs, angles. Plays the shot the point needs, not the one you expect.',
    height: 1.7,
    leftHanded: false,
    oneHandedBackhand: false,
    look: {
      shirt: C.rose,
      shorts: C.cream,
      skin: C.skinLight,
      hair: C.darkBrown,
      shoe: C.paper,
      headband: C.cream,
      accent: C.salmon,
      racket: C.teal,
    },
    stats: { speed: 7.45, consistency: 0.81, power: 0.74, topspin: 0.68, slice: 0.82, net: 0.56, variety: 0.94, serve: 0.64, stamina: 0.88 },
  },
  {
    id: 'hale',
    name: 'Tomás',
    surname: 'Hale',
    nickname: 'The Raider',
    style: 'SERVE & VOLLEY',
    bio: 'Big serve, bigger forehand, and no intention of rallying from the back.',
    height: 1.91,
    leftHanded: false,
    oneHandedBackhand: false,
    look: {
      shirt: C.mustard,
      shorts: C.slate,
      skin: C.skinMid,
      hair: C.brown,
      shoe: C.cream,
      headband: C.cream,
      accent: C.mustard,
      racket: C.cream,
    },
    stats: { speed: 7.35, consistency: 0.74, power: 0.98, topspin: 0.52, slice: 0.72, net: 0.96, variety: 0.3, serve: 0.96, stamina: 0.82 },
  },
];

export function playerById(id: string): PlayerProfile {
  return PLAYERS.find((p) => p.id === id) ?? PLAYERS[0];
}

export function fullName(p: PlayerProfile): string {
  return `${p.name} ${p.surname}`;
}

export function initials(p: PlayerProfile): string {
  return `${p.name[0]}${p.surname[0]}`;
}
