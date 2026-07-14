import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import logoUrl from '../assets/logo.png';
import { IG_BG, IG_TEXT, banner as bannerCls, cx, heading } from '../tw';

/* ---------------------------------------------------------------- Motion */

export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
};

export function stagger(index: number) {
  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.24,
      delay: Math.min(index * 0.04, 0.3),
      ease: [0.22, 1, 0.36, 1] as const,
    },
  };
}

/* ------------------------------------------------------------------ Brand */

export { logoUrl };

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt="InstaPilot"
      className="object-contain"
    />
  );
}

export function BrandName({ tagline = true }: { tagline?: boolean }) {
  return (
    <div>
      <div className="text-lg font-extrabold tracking-[-0.03em]">
        Insta<b className={IG_TEXT}>Pilot</b>
      </div>
      {tagline && (
        <div className="text-[11px] text-faint font-medium tracking-[0.01em]">
          AI-powered Instagram Automation
        </div>
      )}
    </div>
  );
}

export function PoweredBy() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-faint px-2 py-1">
      <span className={cx('w-1.5 h-1.5 rounded-full', IG_BG)} />
      <span>
        Powered by <b className="text-muted font-semibold">TheAutomationHub</b>
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- Spinner */

export function Spinner({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-block rounded-full border-accent-soft border-t-accent animate-spin',
        large ? 'w-[34px] h-[34px] border-[3.5px]' : 'w-5 h-5 border-[2.5px]',
      )}
    />
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 py-16 text-muted">
      <Spinner large />
      <span>{label}</span>
    </div>
  );
}

/* -------------------------------------------------------------- Skeleton */

export function Skeleton({
  w,
  h = 14,
  radius,
  style,
}: {
  w?: number | string;
  h?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="block rounded-lg bg-[linear-gradient(90deg,var(--color-surface-2)_25%,#ececef_50%,var(--color-surface-2)_75%)] bg-size-[200%_100%] animate-shimmer"
      style={{
        width: w ?? '100%',
        height: h,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

/* ------------------------------------------------------------ EmptyState */

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <motion.div
      className="flex flex-col items-center gap-3.5 px-6 py-14 text-center text-muted"
      {...fadeUp}
    >
      <span className="flex items-center justify-center w-16 h-16 rounded-[18px] bg-accent-soft text-accent">
        <Icon size={28} strokeWidth={1.8} />
      </span>
      <h3 className={cx(heading, 'text-[17px]')}>{title}</h3>
      {children && <p className="m-0 max-w-[380px] text-[13.5px]">{children}</p>}
      {action}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- Banner */

type BannerKind = 'error' | 'ok' | 'warn' | 'info';
const BANNER_ICON: Record<BannerKind, LucideIcon> = {
  error: XCircle,
  ok: CheckCircle2,
  warn: AlertTriangle,
  info: Info,
};

export function Banner({
  kind,
  children,
}: {
  kind: BannerKind;
  children: ReactNode;
}) {
  const Icon = BANNER_ICON[kind];
  return (
    <motion.div
      className={bannerCls[kind]}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Icon size={18} className="shrink-0 mt-px" />
      <div>{children}</div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------- Toasts */

type Toast = { id: number; kind: BannerKind; msg: string };
type ToastCtx = { push: (kind: BannerKind, msg: string) => void };

const ToastContext = createContext<ToastCtx>({ push: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_ICON: Record<BannerKind, LucideIcon> = {
  error: XCircle,
  ok: CheckCircle2,
  warn: AlertTriangle,
  info: Sparkles,
};
const TOAST_ICON_COLOR: Record<BannerKind, string> = {
  error: 'text-red',
  ok: 'text-green',
  warn: 'text-accent',
  info: 'text-accent',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: BannerKind, msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, msg }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismiss = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed right-5 bottom-5 z-100 flex flex-col gap-2.5 max-w-[min(380px,calc(100vw-40px))]">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = TOAST_ICON[t.kind];
            return (
              <motion.div
                key={t.id}
                className="flex items-start gap-2.5 bg-surface border border-border rounded-btn shadow-lg px-[15px] py-[13px] text-[13.5px]"
                initial={{ opacity: 0, x: 40, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.96 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <Icon size={18} className={cx('shrink-0', TOAST_ICON_COLOR[t.kind])} />
                <span className="flex-1">{t.msg}</span>
                <button
                  className="flex items-center justify-center w-6 h-6 rounded-[10px] text-muted hover:bg-surface-2 hover:text-text cursor-pointer"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
