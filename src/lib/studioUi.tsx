// ============================================================================
// ui.tsx — Componentes UI self-contained (sem shadcn/Radix)
// API compatível com o que os componentes usam
// ============================================================================
import React, { createContext, useContext, useState, useRef, useEffect } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// ── Card ──────────────────────────────────────────────────────────────────
export const Card = ({ className = "", children }: any) => (
  <div className={cx("min-w-0 bg-card text-card-foreground border border-border rounded-xl", className)}>{children}</div>
);
export const CardHeader = ({ className = "", children }: any) => (
  <div className={cx("px-5 pt-5 pb-2", className)}>{children}</div>
);
export const CardTitle = ({ className = "", children }: any) => (
  <h3 className={cx("font-semibold text-foreground", className)}>{children}</h3>
);
export const CardContent = ({ className = "", children }: any) => (
  <div className={cx("px-5 pb-5", className)}>{children}</div>
);

// ── Button ────────────────────────────────────────────────────────────────
export const Button = ({ className = "", variant = "default", size = "default", disabled, onClick, children, ...rest }: any) => {
  const variants: Record<string, string> = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
    ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
  };
  const sizes: Record<string, string> = {
    default: "h-auto min-h-10 px-4 py-2 text-sm",
    sm: "h-auto min-h-8 px-3 py-1.5 text-xs",
  };
  return (
    <button onClick={onClick} disabled={disabled} {...rest}
      className={cx("inline-flex min-w-0 max-w-full items-center justify-center gap-2 rounded-xl whitespace-normal break-words font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50 disabled:pointer-events-none [&_svg]:shrink-0",
        variants[variant], sizes[size], className)}>
      {children}
    </button>
  );
};

// ── Input ─────────────────────────────────────────────────────────────────
export const Input = ({ className = "", ...rest }: any) => (
  <input {...rest}
    className={cx("w-full min-w-0 max-w-full h-10 px-3 rounded-xl bg-background border border-input text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring placeholder:text-muted-foreground", className)} />
);

// ── Textarea ──────────────────────────────────────────────────────────────
export const Textarea = ({ className = "", ...rest }: any) => (
  <textarea {...rest}
    className={cx("w-full min-w-0 max-w-full px-3 py-2 rounded-xl bg-background border border-input text-sm text-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring placeholder:text-muted-foreground", className)} />
);

// ── Label ─────────────────────────────────────────────────────────────────
export const Label = ({ className = "", children }: any) => (
  <label className={cx("block text-sm font-medium text-foreground", className)}>{children}</label>
);

// ── Badge ─────────────────────────────────────────────────────────────────
export const Badge = ({ className = "", variant = "default", children }: any) => {
  const v: Record<string, string> = {
    default: "bg-primary text-primary-foreground",
    outline: "border border-input text-muted-foreground",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", v[variant], className)}>{children}</span>;
};

// ── Checkbox ──────────────────────────────────────────────────────────────
export const Checkbox = ({ checked, onCheckedChange, id, className = "" }: any) => (
  <button
    type="button" id={id} role="checkbox" aria-checked={checked}
    onClick={() => onCheckedChange?.(!checked)}
    style={checked ? { backgroundColor: "hsl(var(--primary))", borderColor: "hsl(var(--primary))" } : undefined}
    className={cx("h-4 w-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
      checked ? "" : "bg-card border-input", className)}>
    {checked && (
      <svg viewBox="0 0 12 12" className="h-3 w-3 text-primary-foreground" fill="none">
        <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </button>
);

// ── Select (custom dropdown com context) ────────────────────────────────────
const SelectCtx = createContext<any>(null);

export const Select = ({ value, onValueChange, children }: any) => {
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <SelectCtx.Provider value={{ value, onValueChange, open, setOpen, labels, setLabels }}>
      <div ref={ref} className="relative min-w-0">{children}</div>
    </SelectCtx.Provider>
  );
};

export const SelectTrigger = ({ className = "", children }: any) => {
  const { open, setOpen } = useContext(SelectCtx);
  return (
    <button type="button" onClick={() => setOpen(!open)}
      className={cx("w-full min-w-0 max-w-full min-h-10 px-3 py-2 rounded-xl bg-background border border-input text-sm text-foreground flex items-center justify-between gap-2 break-words text-left focus:outline-none focus:border-ring focus-visible:ring-2 focus-visible:ring-ring", className)}>
      {children}
      <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-muted-foreground ml-2" fill="none">
        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
};

export const SelectValue = ({ placeholder }: any) => {
  const { value, labels } = useContext(SelectCtx);
  const label = labels?.[value];
  return <span className={cx(!value && "text-muted-foreground")}>{label || value || placeholder}</span>;
};

export const SelectContent = ({ children }: any) => {
  const { open, setLabels } = useContext(SelectCtx);
  // Coleta labels dos items
  const labels: Record<string, string> = {};
  React.Children.forEach(children, (child: any) => {
    if (child?.props?.value !== undefined) labels[child.props.value] = child.props.children;
  });
  useEffect(() => { setLabels(labels); }, [children]);
  if (!open) return null;
  return (
    <div className="absolute z-50 mt-1 w-full min-w-0 max-w-full bg-card text-card-foreground border border-border rounded-xl shadow-lg max-h-60 overflow-auto p-1 supports-[backdrop-filter]:bg-[var(--linen-glass,hsl(var(--card)))] supports-[backdrop-filter]:[backdrop-filter:var(--sett-glass-bar-filter,none)]">
      {children}
    </div>
  );
};

export const SelectItem = ({ value, children }: any) => {
  const { onValueChange, setOpen, value: selected } = useContext(SelectCtx);
  return (
    <button type="button"
      onClick={() => { onValueChange?.(value); setOpen(false); }}
      className={cx("w-full min-w-0 max-w-full rounded-lg break-words text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected === value ? "text-primary font-medium" : "text-foreground")}>
      {children}
    </button>
  );
};

// ── Tabs ──────────────────────────────────────────────────────────────────
const TabsCtx = createContext<any>(null);

export const Tabs = ({ value, onValueChange, children, className = "" }: any) => (
  <TabsCtx.Provider value={{ value, onValueChange }}>
    <div className={className}>{children}</div>
  </TabsCtx.Provider>
);

export const TabsList = ({ className = "", children }: any) => (
  <div className={cx("inline-flex min-w-0 max-w-full rounded-xl border border-border bg-muted p-1 gap-1 supports-[backdrop-filter]:bg-[var(--linen-glass,hsl(var(--card)))] supports-[backdrop-filter]:[backdrop-filter:var(--sett-glass-bar-filter,none)]", className)}>{children}</div>
);

export const TabsTrigger = ({ value, children }: any) => {
  const { value: active, onValueChange } = useContext(TabsCtx);
  return (
    <button type="button" onClick={() => onValueChange(value)}
      className={cx("min-w-0 flex-1 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-normal break-words transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active === value ? "bg-primary/10 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
};

export const TabsContent = ({ value, children, className = "" }: any) => {
  const { value: active } = useContext(TabsCtx);
  if (active !== value) return null;
  return <div className={className}>{children}</div>;
};
