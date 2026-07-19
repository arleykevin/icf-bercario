markdown_content = """# Documentação do Projeto: PWA Berçário

Este documento serve como o README oficial e o mapa do projeto para o desenvolvimento do Aplicativo para Berçários e Educação Infantil (PWA).

## 1. Visão Geral do Projeto
O sistema será construído primariamente como um **PWA (Progressive Web App)**. O objetivo é remover barreiras de entrada (downloads pesados em lojas de aplicações) e resolver as principais dores do mercado: notificações excessivas, interfaces muito complexas para o uso dinâmico da sala de aula e a falta de visibilidade em tempo real para os responsáveis.

## 2. Arquitetura Técnica (Tech Stack)
* **Frontend (Interface):** React.js (com Vite) ou Next.js. Focado em responsividade e performance mobile, utilizando Service Workers para funcionamento offline.
* **Backend & Banco de Dados (BaaS):** **Supabase**. Fornece banco de dados relacional (PostgreSQL), sistema de autenticação robusto, permissões nativas (Row Level Security) e WebSockets para tempo real (chat e notificações Push).
* **Alojamento (Hosting):** Vercel ou semelhante, garantindo CI/CD automatizado direto do repositório Git.

## 3. Atores e Permissões (Role-Based Access)
| Perfil (Role) | Escopo de Permissão | Principais Ações e Responsabilidades |
| :--- | :--- | :--- |
| **Gestão Escolar (Admin)** | Acesso e controle total sobre o sistema e todas as turmas. | Cadastrar alunos, professores e pais; gerenciar turmas; publicar avisos no mural global; aceder a métricas e relatórios. |
| **Professor / Cuidador** | Acesso restrito apenas às turmas vinculadas ao seu perfil. | Alimentar o diário de bordo (individual ou ações em lote); enviar comunicados para a turma; responder ao chat com os pais; reportar ocorrências e estado de saúde. |
| **Pais / Responsáveis** | Acesso exclusivo aos perfis das crianças das quais são responsáveis. | Visualizar a linha do tempo e histórico; confirmar a leitura de avisos da escola; autorizar administração de medicamentos; cadastrar pessoas autorizadas; interagir via chat. |

## 4. Módulos e Funcionalidades do MVP

### 4.1. Módulo "Diário de Bordo" (Core do App)
* **Alimentação:** Registro do que foi ingerido (Mamadeira, Papinha, Fruta, Refeição Principal), nível de aceitação e horários.
* **Sono:** Períodos de descanso e observação sobre a qualidade do sono (Agitado, Tranquilo).
* **Higiene e Fraldas:** Horários de troca, tipos de evacuação (informação sensível e crítica para saúde) e banhos.
* **Saúde e Medicamentos:** Registro de febre, e aplicação de medicamentos condicionada à autorização digital prévia assinada pelos pais.
* **Rotina e Atividades:** Registro do humor (Choroso, Brincalhão) e acompanhamento de atividades pedagógicas.

### 4.2. Módulo de Comunicação & Alertas
* **Mural de Avisos:** Central de comunicados gerais. *Recurso crítico:* Obrigatoriedade de clicar no botão "Ciente" para acompanhamento de leitura da gestão.
* **Chat Direto:** Canal de comunicação privado que respeita a jornada do professor (silenciamento fora do horário configurado).
* **Lista de Suprimentos:** Notificações sobre itens da mochila que estão a acabar (fraldas, lenços, pomadas).

### 4.3. Módulo de Segurança e Gestão
* **Controle de Autorizados:** Catálogo seguro com RG e fotos dos indivíduos autorizados a retirar a criança da escola.
* **Galeria de Fotos Privada:** Sistema de mídia com tags, onde as fotos só chegam aos perfis dos pais marcados.
* **Calendário:** Cardápio da semana e eventos institucionais futuros.

## 5. Árvore de Navegação e UX (Sitemap)

1. **Autenticação:** Ecrã de Login com opções E-mail/Senha e OAuth (Google).
2. **Visão dos Pais (Dashboard):**
    * Home (Linha do tempo diária da criança em foco)
    * Avisos (Mural visual com marcação de "Lido" e "Não Lido")
    * Rotina (Consulta de histórico e dias anteriores)
    * Perfil (Central de saúde, alergias, e controlo de autorizados)
3. **Visão do Professor (Dashboard):**
    * Home (Grid visual dos alunos da turma)
    * Ações em Lote (Botões rápidos para preencher dados de várias crianças simultaneamente)
    * Perfil do Aluno (Ecrã focado para detalhes aprofundados e individualizados)

## 6. Estrutura do Banco de Dados (Supabase / PostgreSQL)