import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";

export function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as any;
  return (
    <div className={`px-4 py-3 rounded-lg border-2 min-w-[200px] shadow-md bg-amber-500/10 border-amber-500 ${selected ? "ring-2 ring-amber-400" : ""}`}>
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded bg-amber-500 flex items-center justify-center">
          <GitBranch className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{nodeData.label || "Condição"}</span>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span className="text-emerald-600">✓ Sim</span>
        <span className="text-red-500">✗ Não</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="true" className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-500 !w-3 !h-3 !border-2 !border-white !left-[70%]" />
    </div>
  );
}
