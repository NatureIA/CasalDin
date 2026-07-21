# CasaDin

Portal financeiro familiar conectado ao Google Forms e ao Google Sheets.

## Arquivos

- `index.html`
- `style.css`
- `script.js`

## Fonte dos dados

O endereço CSV já está configurado dentro do arquivo `script.js`.

## Publicação no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie os três arquivos para a raiz do repositório.
3. Abra `Settings`.
4. Entre em `Pages`.
5. Em `Build and deployment`, selecione `Deploy from a branch`.
6. Selecione a branch `main` e a pasta `/root`.
7. Salve.
8. Aguarde o link público do GitHub Pages.

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
