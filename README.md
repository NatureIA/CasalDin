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

## Inteligência financeira (v4)

A versão inclui linha do tempo financeira de longo prazo, radar automático de anomalias, painel financeiro mensal baseado no mês seguinte ao cadastro de parcelas/recorrências e fechamento mensal com impressão em PDF. Nenhum novo campo é necessário no Google Forms.

## Inclusão de nota via OCR com envio ao Google Forms

O botão `Incluir nota` abre um formulário interno do portal. O fluxo é:

1. O usuário seleciona o **responsável** (Victor ou Lara) e a **categoria** (Salário, Moradia, Alimentação, Transporte, Saúde, Lazer, Água, Energia, Internet ou Outros).
2. Envia uma foto da nota fiscal/comprovante.
3. O OCR (via API ocr.space) extrai automaticamente:
   - **Estabelecimento** → utilizado como **descrição**
   - **Valor total** (ex: R$ 185,90)
   - **Forma de pagamento** (ex: Pix, Cartão de crédito, Dinheiro)
4. Os campos extraídos são pré-preenchidos para revisão do usuário.
5. Ao clicar em **Confirmar inclusão**, o sistema monta uma requisição `POST` para o **Google Forms** com os seguintes campos mapeados:

| Campo do Forms | ID               | Valor enviado                              |
|----------------|------------------|--------------------------------------------|
| Nome           | entry.680682825  | Descrição (estabelecimento)                |
| Tipo           | entry.83532577   | `Despesa` (fixo)                           |
| Categoria      | entry.228518281  | Categoria selecionada pelo usuário         |
| Forma de pagamento | entry.1422234492 | Extraída da nota ou editada              |
| Condição       | entry.844975634  | `Pago` (fixo, indicando à vista)           |
| Descrição      | entry.853825704  | Mesmo valor do campo Nome                  |
| Valor          | entry.2025566254 | Valor numérico com vírgula (ex: `185,90`)  |

6. O Google Forms recebe os dados e os insere automaticamente no Google Sheets vinculado.
7. O portal recarrega o **CSV público** e a nova despesa aparece instantaneamente no painel, gráficos e histórico.

> **Importante:** Não há mais armazenamento local (`localStorage`) para as notas. Todo o registro é persistido diretamente na planilha, garantindo que os lançamentos fiquem disponíveis em todos os dispositivos e navegadores.