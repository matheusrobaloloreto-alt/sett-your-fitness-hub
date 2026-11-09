import { useEffect, useRef, useState } from "react";
import { Download, Share, Plus, X, MoreVertical } from "lucide-react";
import { matchRoutes, useLocation } from "react-router-dom";

// Popup "baixar o app". Três modos, porque cada plataforma instala de um jeito:
//  - android-native: Chrome capturou o beforeinstallprompt (window.__bip) → botão de 1 toque.
//  - android-manual: Android sem o evento ainda → instrução do menu (⋮ → Instalar app).
//  - ios: o iPhone NÃO permite instalar por link (restrição da Apple) → guia Compartilhar → Adicionar.
// Mantém o pinch-zoom (acessibilidade); dispensa por 7 dias; some quando já está instalado.

const DISMISS_KEY = "sett_install_dismissed";
const DISMISS_DAYS = 7;
const PUBLIC_FORM_ROUTES = [
  { path: "/cadastro/*" },
  { path: "/inscricao/*" },
  { path: "/cadastro-fiscal/*" },
  { path: "/anamnese/*" },
  { path: "/anamnese-convite/*" },
  { path: "/anamnese-interciclos/*" },
  { path: "/pagamento/*" },
];

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
function isIOS(): boolean {
  const ua = window.navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}
function isAndroid(): boolean {
  return /android/i.test(window.navigator.userAgent || "");
}
function dismissedRecently(): boolean {
  try {
    const v = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return v > 0 && Date.now() - v < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

type Mode = "android-native" | "android-manual" | "ios" | null;

export function InstallPrompt() {
  const { pathname } = useLocation();
  const isPublicForm = matchRoutes(PUBLIC_FORM_ROUTES, pathname) !== null;
  const bannerRef = useRef<HTMLDivElement>(null);
  const [chatOpen, setChatOpen] = useState(() => document.documentElement.dataset.settChatOpen === "true");
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<Mode>(null);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    const decide = () => {
      const w = window as unknown as { __bip?: unknown };
      if (w.__bip) setMode("android-native");
      else if (isIOS()) setMode("ios");
      else if (isAndroid()) setMode("android-manual");
      else setMode(null);
    };
    decide();
    window.addEventListener("bip-ready", decide);
    const t = setTimeout(() => setShow(true), 2500);
    return () => { clearTimeout(t); window.removeEventListener("bip-ready", decide); };
  }, []);

  useEffect(() => {
    const listener = (event: Event) => setChatOpen(Boolean((event as CustomEvent<{ open: boolean }>).detail.open));
    window.addEventListener("sett:chat-layout", listener);
    return () => window.removeEventListener("sett:chat-layout", listener);
  }, []);
  useEffect(() => {
    const node = bannerRef.current;
    const measure = () => document.documentElement.style.setProperty("--sett-install-height", `${node?.getBoundingClientRect().height || 0}px`);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (node) observer?.observe(node);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); document.documentElement.style.removeProperty("--sett-install-height"); };
  }, [show, mode, chatOpen, isPublicForm]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  };

  const installAndroid = async () => {
    const w = window as unknown as { __bip?: { prompt: () => void; userChoice: Promise<{ outcome: string }> } };
    const bip = w.__bip;
    if (!bip) return;
    try { bip.prompt(); await bip.userChoice; } catch { /* ignore */ }
    w.__bip = undefined;
    dismiss();
  };

  if (isPublicForm || !show || !mode || chatOpen) return null;

  return (
    <div
      ref={bannerRef}
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
      role="dialog"
      aria-label="Instalar o app"
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-navy text-primary-foreground shadow-2xl">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Download className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base leading-tight">Instale o SETT no seu celular</p>

            {mode === "android-native" && (
              <>
                <p className="mt-0.5 text-xs text-primary-foreground/80">
                  Acesso rápido na tela inicial, em tela cheia.
                </p>
                <button
                  type="button"
                  onClick={installAndroid}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-navy"
                >
                  <Download className="h-3.5 w-3.5" /> Instalar app
                </button>
              </>
            )}

            {mode === "android-manual" && (
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-primary-foreground/80">
                Toque no menu <MoreVertical className="inline h-3.5 w-3.5" /> do navegador e em
                <span className="font-medium">&ldquo;Instalar app&rdquo;</span> (ou
                <span className="font-medium">&ldquo;Adicionar à tela inicial&rdquo;</span>).
              </p>
            )}

            {mode === "ios" && (
              <>
                <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-primary-foreground/80">
                  Toque em <Share className="inline h-3.5 w-3.5" /> <span className="font-medium">Compartilhar</span> e depois em
                  <span className="inline-flex items-center gap-0.5 font-medium"><Plus className="h-3.5 w-3.5" /> Adicionar à Tela de Início</span>.
                </p>
                <p className="mt-1 text-[10px] text-primary-foreground/55">
                  No iPhone, o app só instala por esse caminho (a Apple não permite botão automático).
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dispensar"
            className="shrink-0 rounded-full p-1 text-primary-foreground/70 transition hover:bg-white/10 hover:text-primary-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
