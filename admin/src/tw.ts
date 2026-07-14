import { twMerge } from 'tailwind-merge';

/**
 * Join conditional class names and let tailwind-merge resolve any standard
 * utility conflicts (last one wins). Component "variant" constants below are
 * intentionally split so they never fight over the same custom-color utility.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(' '));
}

/* ---------------------------------------------------------- Brand gradients */

export const IG_BG =
  'bg-[linear-gradient(135deg,#f58529_0%,#dd2a7b_45%,#8134af_75%,#515bd4_100%)]';
export const IG_TEXT = `${IG_BG} bg-clip-text text-transparent`;
export const IG_SOFT_CARD =
  'bg-[linear-gradient(135deg,rgba(245,133,41,0.12),rgba(221,42,123,0.12),rgba(129,52,175,0.12),rgba(81,91,212,0.12)),linear-gradient(#fff,#fff)]';

/* ---------------------------------------------------------------- Buttons */

const btnBase =
  'inline-flex items-center justify-center gap-2 h-11 px-[18px] rounded-btn text-sm font-semibold tracking-[-0.01em] font-sans whitespace-nowrap cursor-pointer border border-transparent transition-[background-color,box-shadow,transform,border-color,opacity] duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_4px_var(--accent-ring)] disabled:opacity-55 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none';

export const btn = {
  primary: `${btnBase} bg-accent text-white hover:bg-accent-hover hover:shadow-md hover:-translate-y-px active:translate-y-0`,
  secondary: `${btnBase} bg-surface text-text border-border hover:bg-surface-2 hover:border-border-strong hover:shadow-sm hover:-translate-y-px active:translate-y-0`,
  ghost: `${btnBase} bg-transparent text-muted hover:bg-surface-2 hover:text-text`,
  danger: `${btnBase} bg-surface text-red border-[rgba(220,38,38,0.25)] hover:bg-red-soft hover:border-[rgba(220,38,38,0.4)]`,
  premium: `${btnBase} text-white border-0 shadow-sm ${IG_BG} bg-[length:160%_160%] animate-gradient hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(221,42,123,0.32)]`,
};

export const btnSm = 'h-9 px-[13px] text-[13px] rounded-[10px]';
export const btnIcon = 'p-0 w-11';
export const btnIconSm = 'p-0 w-9';

/* ------------------------------------------------------------------ Cards */

export const card =
  'bg-surface border border-border rounded-card shadow-sm p-6';
export const cardHover =
  'transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-border-strong';

/* ----------------------------------------------------------------- Badges */

const badgeBase =
  'inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-[3px] rounded-pill tracking-[0.01em] border';
export const badge = {
  default: `${badgeBase} bg-surface-2 border-border text-muted`,
  on: `${badgeBase} bg-green-soft border-[rgba(22,163,74,0.25)] text-green`,
  off: `${badgeBase} bg-red-soft border-[rgba(220,38,38,0.22)] text-red`,
  kw: `${badgeBase} bg-accent-soft border-[rgba(124,58,237,0.22)] text-accent`,
  premium: `${badgeBase} border-0 text-white ${IG_BG}`,
};

/* ------------------------------------------------------------------ Forms */

export const label = 'block text-[13px] text-text font-medium mb-[7px]';
export const control =
  'w-full bg-surface border border-border rounded-input text-text text-sm font-sans transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:outline-none focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-ring)]';
export const input = `${control} h-[46px] px-3.5`;
export const textarea = `${control} min-h-[92px] py-3 px-3.5 leading-[1.55] resize-y`;
export const field = 'mb-[18px]';
export const hint = 'text-muted text-[12.5px] mt-1.5 leading-normal';
export const codeInline =
  'bg-surface-2 border border-border text-accent px-1.5 py-px rounded-md text-xs font-mono';

/* -------------------------------------------------------------- Banners */

const bannerBase =
  'flex items-start gap-2.5 px-4 py-[13px] rounded-btn mb-[18px] text-[13.5px] leading-normal border';
export const banner = {
  error: `${bannerBase} bg-red-soft border-[rgba(220,38,38,0.2)] text-[#b91c1c]`,
  ok: `${bannerBase} bg-green-soft border-[rgba(22,163,74,0.2)] text-[#15803d]`,
  warn: `${bannerBase} bg-yellow-soft border-[rgba(217,119,6,0.2)] text-[#b45309]`,
  info: `${bannerBase} bg-accent-soft border-[rgba(124,58,237,0.18)] text-accent-hover`,
};

/* ----------------------------------------------------------- Stat icon tile */

const statIconBase =
  'flex items-center justify-center w-11 h-11 rounded-xl shrink-0';
export const statIcon = {
  accent: `${statIconBase} bg-accent-soft text-accent`,
  ig: `${statIconBase} ${IG_BG} text-white`,
  green: `${statIconBase} bg-green-soft text-green`,
  amber: `${statIconBase} bg-yellow-soft text-yellow`,
  red: `${statIconBase} bg-red-soft text-red`,
};

/* ------------------------------------------------------------- Misc chips */

export const chip =
  'inline-flex items-center gap-[7px] px-3 py-1.5 rounded-pill border border-border bg-surface text-muted text-[12.5px] font-medium';

export const sectionHead =
  'flex items-end justify-between gap-4 flex-wrap mb-6';
export const panelHead = 'flex items-center justify-between gap-3 mb-[18px]';

export const heading = 'font-bold tracking-[-0.02em] text-text';

export function statusDot(kind: string): string {
  const base = 'inline-block w-2 h-2 rounded-full';
  if (kind === 'ok' || kind === 'success')
    return `${base} bg-green shadow-[0_0_0_3px_var(--color-green-soft)]`;
  if (kind === 'down' || kind === 'error')
    return `${base} bg-red shadow-[0_0_0_3px_var(--color-red-soft)]`;
  return `${base} bg-faint`;
}

export const tableCls = 'w-full border-collapse text-[13.5px]';
export const th =
  'text-left px-4 py-[13px] text-muted font-semibold text-xs uppercase tracking-[0.04em] bg-surface-2 border-b border-border whitespace-nowrap';
export const td = 'px-4 py-[13px] align-middle border-b border-border';
export const tr = 'transition-colors duration-100 hover:bg-surface-2';

export const avatar = 'rounded-full object-cover bg-surface-2';
export const avatarFallback = `rounded-full flex items-center justify-center font-bold text-white ${IG_BG}`;
