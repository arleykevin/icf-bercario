# Budget de Core Web Vitals

Alvos de performance (PLANO §9 "budget CWV"). O app é usado em **tablets de sala** e
celulares de pais — muitas vezes em rede fraca — então velocidade percebida é UX e
adoção, não vaidade.

## Metas (em `budget.json`, formato Lighthouse)

| Métrica | Meta     | Por quê                                    |
| ------- | -------- | ------------------------------------------ |
| LCP     | ≤ 2,5 s  | conteúdo principal visível                 |
| TTI     | ≤ 3,5 s  | interação (registrar rápido com 12+ bebês) |
| TBT     | ≤ 200 ms | responsividade ao toque                    |
| CLS     | ≤ 0,1    | sem "pulos" que causam toque errado        |
| JS      | ≤ 300 KB | orçamento de script por rota               |
| Total   | ≤ 900 KB | peso total por rota                        |

## Como medir

```
npm run build && npm run start
npx lighthouse http://localhost:3000/inicio --budget-path=budget.json --view
```

Ou plugar o `budget.json` no Lighthouse CI para falhar o pipeline quando estourar.

## Notas

- Fotos passam por bucket privado + URL assinada; aplicar **resize/CDN** antes do
  go-live para não estourar o orçamento de imagem (PLANO §9 custo de Storage).
- O Service Worker (Serwist) já faz precache do app shell — bom para repetição de
  carga no tablet.
