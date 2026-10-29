import {loadPublishedForm,assertPublishedAnswers,type FormReadClient} from './published-forms.ts';
import {projectFormAnswers} from './form-definitions.ts';
import {normalizeWorkoutFeedbackPayload} from './student-workout-feedback.ts';
import {HttpError,isUuid} from './tenant-auth.ts';

export async function preparePublishedWorkoutFeedback(client:FormReadClient,companyId:string,body:Record<string,unknown>) {
  if(!Object.hasOwn(body,'form_definition_id')) {
    if(Object.hasOwn(body,'versioned_answers'))throw new HttpError(422,'Versao obrigatoria.');
    const latest=await loadPublishedForm(client,companyId,'workout_feedback');
    if(latest)throw new HttpError(409,'O formulario de feedback mudou. Reabra para responder.');
    return null;
  }
  if(!isUuid(body.form_definition_id))throw new HttpError(422,'Versao invalida.');
  const form=await loadPublishedForm(client,companyId,'workout_feedback',body.form_definition_id);
  if(!form)throw new HttpError(409,'Versao indisponivel.');
  assertPublishedAnswers(form,body.form_definition_id,body.versioned_answers);
  const canonical=projectFormAnswers(form.definition,body.versioned_answers);
  if(typeof canonical.reflection==='string' && canonical.reflection.length>1000)throw new HttpError(422,'Comentario excede 1000 caracteres.');
  try{return {payload:normalizeWorkoutFeedbackPayload({...canonical,workout_title:body.workout_title,workout_session_id:body.workout_session_id}),formDefinitionId:form.id,answers:body.versioned_answers};}
  catch{throw new HttpError(422,'Informe uma percepcao ou comentario valido antes de enviar.');}
}
