import { addBusinessDays } from "./sales-funnel.ts";
export function assessmentDeadline(start:Date,businessDays:number):Date {
 if(!Number.isInteger(businessDays)||businessDays<1||businessDays>30||!Number.isFinite(start.getTime()))throw new Error("Prazo de avaliação inválido.");
 return addBusinessDays(start,businessDays);
}
