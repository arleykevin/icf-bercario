# ROPA — Registro das Operações de Tratamento

> ⚠️ Rascunho técnico para revisão do DPO/jurídico (ver [README](./README.md)).
> Base legal: art. 37 da LGPD.

- **Controlador:** «Instituto Cinthia França» — CNPJ «…»
- **Encarregado (DPO):** «nome / contato»
- **Última atualização:** «data»

Cada linha é uma **operação de tratamento**. Manter atualizado a cada nova
funcionalidade que trate dado pessoal.

## 1. Onboarding e cadastro

| Campo            | Conteúdo                                                    |
| ---------------- | ----------------------------------------------------------- |
| Finalidade       | Matricular a criança e vincular responsáveis/equipe         |
| Categorias       | Nome/nascimento da criança; nome/e-mail/telefone de adultos |
| Titulares        | Crianças, responsáveis, equipe                              |
| Base legal       | Execução de contrato; melhor interesse da criança (art. 14) |
| Retenção         | Enquanto vigente o vínculo + prazos legais                  |
| Compartilhamento | Supabase (operador)                                         |
| Segurança        | RLS, convite com e-mail verificado, consentimento imutável  |

## 2. Diário de bordo e fotos

| Campo      | Conteúdo                                                       |
| ---------- | -------------------------------------------------------------- |
| Finalidade | Registrar rotina e comunicar a família                         |
| Categorias | Alimentação, sono, troca, humor, atividades, **fotos**         |
| Base legal | Execução de contrato; **fotos = consentimento** específico     |
| Retenção   | **90 dias** após a saída (ajustável) — eliminação automatizada |
| Segurança  | Append-only; bucket privado + URL assinada; SW não cacheia     |

## 3. Saúde e medicamento

| Campo      | Conteúdo                                                                         |
| ---------- | -------------------------------------------------------------------------------- |
| Finalidade | Tutela da saúde e administração segura de medicamento                            |
| Categorias | **Dados de saúde (sensíveis)**: alergias, febre, autorização/administração       |
| Base legal | Art. 11, II ("f" tutela da saúde); art. 14                                       |
| Retenção   | Prazo de **responsabilização** «definir» (retido, não purgado)                   |
| Segurança  | Registros **imutáveis** com hash/identidade/timestamp; RLS por responsável legal |

## 4. Comunicação e "Ciente"

| Campo      | Conteúdo                                                |
| ---------- | ------------------------------------------------------- |
| Finalidade | Avisos da escola e confirmação de leitura               |
| Categorias | Conteúdo do comunicado; identidade de quem deu "Ciente" |
| Base legal | Execução de contrato / legítimo interesse               |
| Retenção   | Registro institucional «definir»                        |
| Segurança  | "Ciente" imutável; RLS                                  |

## 5. Presença (check-in/out)

| Campo      | Conteúdo                                   |
| ---------- | ------------------------------------------ |
| Finalidade | Segurança na entrada/retirada              |
| Categorias | Horário, quem entregou/retirou             |
| Base legal | Execução de contrato; segurança da criança |
| Segurança  | Registro imutável                          |

## 6. Autenticação e segurança

| Campo      | Conteúdo                                                                  |
| ---------- | ------------------------------------------------------------------------- |
| Finalidade | Controle de acesso e prevenção a abuso                                    |
| Categorias | E-mail, hash de PIN (isolado), **IP hasheado** (rate limit), logs de auth |
| Base legal | Legítimo interesse (segurança)                                            |
| Retenção   | Logs de acesso ~6 meses (Marco Civil art. 15)                             |
| Segurança  | MFA para admin, rate limiting, offboarding com revogação de sessão        |

## 7. Direitos do titular

| Campo      | Conteúdo                                                               |
| ---------- | ---------------------------------------------------------------------- |
| Finalidade | Atender acesso, portabilidade e eliminação (art. 18)                   |
| Categorias | Pedido, status, resposta                                               |
| Base legal | Obrigação legal (LGPD)                                                 |
| Segurança  | RLS (responsável vê o próprio; admin resolve); exportação respeita RLS |

## 8. Operadores (sub-tratadores)

| Operador                  | Serviço               | Região      | DPA |
| ------------------------- | --------------------- | ----------- | --- |
| Supabase                  | Banco/Auth/Storage    | «us-west-2» | ⚠️  |
| Sentry                    | Erros (com scrubbing) | «…»         | ⚠️  |
| «Provedor de e-mail/push» | Avisos                | «…»         | ⚠️  |
