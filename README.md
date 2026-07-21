# CasaDin

Portal financeiro familiar conectado ao Google Forms e ao Google Sheets.

## Arquivos

- `index.html`
- `style.css`
- `script.js`
- `README.md`

## Fonte dos dados

O endereço CSV já está configurado dentro do arquivo `script.js`.

## Publicação no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie os quatro arquivos para a raiz.
3. Abra `Settings` → `Pages`.
4. Em `Build and deployment`, selecione `Deploy from a branch`.
5. Selecione a branch `main` e a pasta `/root`.
6. Salve e aguarde o link público.

## Cabeçalhos reconhecidos automaticamente

O portal tenta reconhecer variações dos seguintes campos:

- Carimbo de data/hora
- Responsável
- Tipo de lançamento
- Categoria
- Descrição
- Valor Total
- Forma de pagamento
- Como será pago?
- Parcelas restantes
- Frequência

## Regra dos parcelamentos

O valor informado no Forms é tratado como o valor de cada parcela.

Exemplo:

- Valor: 850
- Parcelas restantes: 390

O portal projeta R$ 850 por mês durante 390 meses.

A primeira parcela sempre começa no mês seguinte ao cadastro.

O gráfico de projeção se expande automaticamente para mostrar todo o período
do parcelamento mais longo, mantendo no mínimo 12 meses.

## Inteligência financeira (v4)

A versão inclui linha do tempo financeira de longo prazo, radar automático de anomalias, painel financeiro mensal baseado no mês seguinte ao cadastro de parcelas/recorrências e fechamento mensal com impressão em PDF. Nenhum novo campo é necessário no Google Forms.

## Inclusão de nota via OCR com envio ao Google Forms

O botão `Incluir nota` abre um formulário interno do portal. O fluxo é:

1. O usuário seleciona o **responsável** (Victor ou Lara) e a **categoria**.
2. Envia uma foto da nota fiscal/comprovante.
3. O OCR extrai automaticamente: **estabelecimento** (descrição), **valor total** e **forma de pagamento**.
4. Os campos extraídos são pré-preenchidos para revisão.
5. Ao confirmar, os dados são enviados via POST para o **Google Forms**.
6. O Google Forms insere os dados no Google Sheets vinculado.
7. O portal recarrega o **CSV público** e a nova despesa aparece instantaneamente.

> **Importante:** Não há armazenamento local (`localStorage`). Todo registro é persistido diretamente na planilha.
