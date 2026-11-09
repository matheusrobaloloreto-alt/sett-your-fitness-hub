import { useAuth } from "@/hooks/useAuth";

export function AccessLookupError() {
  const { retryAccessLookup, signOut } = useAuth();
  return (
    <main className="min-h-screen grid place-content-center gap-4 px-6 text-center">
      <h2 className="text-xl font-semibold">Não foi possível verificar seu acesso</h2>
      <button type="button" className="underline" onClick={retryAccessLookup}>Tentar novamente</button>
      <button type="button" className="underline" onClick={() => void signOut()}>Sair</button>
    </main>
  );
}
