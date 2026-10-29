import { createContext,useContext } from "react";
import type { BnRenderBrand } from "./bnContentRenderer";
export const BnContentBrandContext=createContext<{brand:BnRenderBrand;logoUrl:string|null}|null>(null);
export const useBnContentBrand=()=>useContext(BnContentBrandContext);
