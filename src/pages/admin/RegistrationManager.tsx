import { AppLayout } from "@/components/AppLayout";
import FormFieldEditor from "@/components/FormFieldEditor";

export default function RegistrationManager() {
  return (
    <AppLayout>
      <FormFieldEditor
        formType="registration"
        title="CADASTRO"
        subtitle="Editor do formulário de cadastro — as alterações refletem no formulário público"
        publicPath="/cadastro"
      />
    </AppLayout>
  );
}
