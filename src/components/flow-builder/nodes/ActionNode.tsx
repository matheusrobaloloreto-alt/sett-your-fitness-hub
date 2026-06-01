import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Cog } from "lucide-react";

export function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as any;
  return (
    <div className={`px-4 py-3 rounded-lg border-2 min-w-[180px] shadow-md bg-rose-500/10 border-rose-500 ${selected ? "ring-2 ring-rose-400" : ""}`}>
      <Handle type="target" position={Position.Top} className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded bg-rose-500 flex items-center justify-center">
          <Cog className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">{nodeData.label || "Ação"}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}
