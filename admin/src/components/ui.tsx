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
    <img src={logoUrl} width={size} height={size} alt="InstaPilot" />
  );
}

export function BrandName({ tagline = true }: { tagline?: boolean }) {
  return (
    <div>
      <div className="name">
        Insta<b>Pilot</b>
      </div>
      {tagline && <div className="tag">AI-powered Instagram Automation</div>}
    </div>
  );
}

export function PoweredBy() {
  return (
    <div className="powered-by">
      <span className="spark" />
      <span>
        Powered by <b>TheAutomationHub</b>
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- Spinner */

export function Spinner({ large = false }: { large?: boolean }) {
  return <span className={`spinner${large ? ' lg' : ''}`} aria-hidden />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-center">
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
      className="skeleton"
      style={{
        display: 'block',
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
    <motion.div className="empty" {...fadeUp}>
      <span className="empty-icon">
        <Icon size={28} strokeWidth={1.8} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
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
      className={`banner ${kind}`}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Icon size={18} />
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
      <div className="toast-wrap">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = TOAST_ICON[t.kind];
            const cls = t.kind === 'error' ? 'error' : t.kind === 'ok' ? 'ok' : 'info';
            return (
              <motion.div
                key={t.id}
                className={`toast ${cls}`}
                initial={{ opacity: 0, x: 40, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.96 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <Icon size={18} className="t-icon" />
                <span className="t-msg">{t.msg}</span>
                <button
                  className="modal-close"
                  style={{ width: 24, height: 24 }}
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
