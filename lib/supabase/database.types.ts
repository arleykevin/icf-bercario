/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tipos do banco. Gerados a partir do schema real com:
 *   npm run gen:types   (requer `supabase start` local OU projeto linkado)
 *
 * Placeholder PERMISSIVO até o projeto Supabase ser provisionado: aceita qualquer
 * tabela/coluna para não travar o build. Assim que rodar `gen:types`, este arquivo é
 * substituído por tipos estritos (e o código, que usa tabelas/colunas reais, segue válido).
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericTable = {
  Row: Record<string, any>;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: { [name: string]: GenericTable };
    Views: { [name: string]: GenericTable };
    Functions: { [name: string]: { Args: Record<string, any>; Returns: any } };
    Enums: {
      app_role: "admin" | "teacher" | "staff" | "guardian";
    };
    CompositeTypes: { [name: string]: Record<string, any> };
  };
};
