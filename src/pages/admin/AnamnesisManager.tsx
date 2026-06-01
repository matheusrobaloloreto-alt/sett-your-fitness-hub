import { AppLayout } from "@/components/AppLayout";
import FormFieldEditor from "@/components/FormFieldEditor";

export default function AnamnesisManager() {
  return (
    <AppLayout>
      <FormFieldEditor
        formType="anamnesis"
        title="ANAMNESE"
        subtitle="Editor do formulário de anamnese — o link individual é gerado por aluno após o cadastro"
        publicPath="/anamnese"
      />
    </AppLayout>
  );
}
