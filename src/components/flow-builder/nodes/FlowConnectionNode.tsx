import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Link } from "lucide-react";

export function FlowConnectionNode({ data, selected }: NodeProps) {
  const nodeData = data as any;
  return (
    <div className={`px-4 py-3 rounded-lg border-2 min-w-[180px] shadow-md bg-teal-500/10 border-teal-500 ${selected ? "ring-2 ring-teal-400" : ""}`}>
      <Handle type="target" position={Position.Top} className="!bg-teal-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded bg-teal-500 flex items-center justify-center">
          <Link className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">{nodeData.label || "Ir para Fluxo"}</span>
      </div>
    </div>
  );
}
