import { Handle, Position, type NodeProps } from "@xyflow/react";
import { List } from "lucide-react";

export function MenuNode({ data, selected }: NodeProps) {
  const nodeData = data as any;
  const options: { number: number; text: string }[] = nodeData.options || [
    { number: 1, text: "Opção 1" },
    { number: 2, text: "Opção 2" },
  ];

  return (
    <div className={`px-4 py-3 rounded-lg border-2 min-w-[200px] max-w-[260px] shadow-md bg-purple-500/10 border-purple-500 ${selected ? "ring-2 ring-purple-400" : ""}`}>
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded bg-purple-500 flex items-center justify-center">
          <List className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">{nodeData.label || "Menu"}</span>
      </div>
      <div className="space-y-1">
        {options.map((opt, i) => (
          <div key={i} className="text-[10px] text-muted-foreground bg-background/50 rounded px-2 py-0.5">
            {opt.number}. {opt.text}
          </div>
        ))}
      </div>
      {options.map((opt, i) => (
        <Handle
          key={i}
          type="source"
          position={Position.Bottom}
          id={`option-${opt.number}`}
          className="!bg-purple-500 !w-2.5 !h-2.5 !border-2 !border-white"
          style={{ left: `${((i + 1) / (options.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}
