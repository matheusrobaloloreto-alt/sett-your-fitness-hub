import {useEffect,useState} from 'react';
import {fetchFormDefinition,type FormKind,type PublishedForm} from '@/lib/formDefinitions';
export function usePublishedInstrumentState(companyId:string|null,kind:FormKind) {
  const key=`${companyId}:${kind}`;
  const [state,setState]=useState<{key:string;published:PublishedForm|null;loaded:boolean;error:string|null}>({key,published:null,loaded:false,error:null});
  useEffect(()=>{let active=true;setState({key,published:null,loaded:false,error:null});if(companyId)void fetchFormDefinition(companyId,kind).then(row=>{if(active)setState({key,published:row,loaded:true,error:null});}).catch(()=>{if(active)setState({key,published:null,loaded:true,error:'Formulario indisponivel. Tente novamente mais tarde.'});});else setState({key,published:null,loaded:true,error:null});return()=>{active=false;};},[companyId,kind,key]);
  return state.key===key?state:{key,published:null,loaded:false,error:null};
}
export function usePublishedInstrument(companyId:string|null,kind:FormKind) {
  return usePublishedInstrumentState(companyId,kind).published;
}
