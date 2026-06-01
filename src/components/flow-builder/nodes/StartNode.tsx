import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";

export function StartNode({ selected }: NodeProps) {
  return (
    <div className={`px-4 py-3 rounded-lg border-2 min-w-[180px] shadow-md bg-emerald-500/10 border-emerald-500 ${selected ? "ring-2 ring-emerald-400" : ""}`}>
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-emerald-500 flex items-center justify-center">
          <Play className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Bloco Inicial</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}
