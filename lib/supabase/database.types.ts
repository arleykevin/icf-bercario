/**
 * Tipos do banco. Gerados a partir do schema real com:
 *   npm run gen:types   (requer `supabase start` local OU projeto linkado)
 *
 * Placeholder mínimo até termos um projeto Supabase provisionado. Mantém os clients
 * tipados sem quebrar o build. NÃO edite à mão depois que a geração estiver ativa.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: "admin" | "teacher" | "staff" | "guardian";
    };
    CompositeTypes: Record<string, never>;
  };
};
