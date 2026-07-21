const CSV_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfHREBYA5cyZFouXhRYi94WjKx2pQXK213uOg6Vo-lNj0sfSg/formResponse";

const OCR_API_KEY = "helloworld";
const OCR_URL = "https://api.ocr.space/parse/image";

// Endpoint do Google Forms
const FORMS_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfHREBYA5cyZFouXhRYi94WjKx2pQXK213uOg6Vo-lNj0sfSg/viewform?usp=sharing&ouid=117343320569638828679";

const state = {
  records: [],
  charts: {
    fluxo: null,
    categorias: null,
    projecao: null,
    timeline: null,
  },
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR");

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "2-digit",
});

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindFilters();
  bindNoteInclusion();
  loadData();
});

function bindNavigation() {
  const buttons = document.querySelectorAll(".nav-item");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const target = button.dataset.target;
      document.querySelectorAll(".page-section").forEach((section) => {
        section.classList.toggle("active-section", section.id === target);
      });
      const titleMap = {
        "visao-geral": "Visão geral",
        projecoes: "Projeções",
        inteligencia: "Inteligência financeira",
        historico: "Histórico",
      };
      document.querySelector(".topbar h1").textContent = titleMap[target] || "CasaDin";
    });
  });
}

function bindFilters() {
  document.getElementById("responsavelFilter").addEventListener("change", renderDashboard);
  document.getElementById("anoFilter").addEventListener("change", renderDashboard);
  document.getElementById("periodoFilter").addEventListener("change", renderDashboard);
  document.getElementById("refreshButton").addEventListener("click", loadData);
  document.getElementById("historySearch").addEventListener("input", renderHistory);

  const monthFocus = document.getElementById("monthFocus");
  if (monthFocus) {
    monthFocus.value = toMonthInputValue(new Date());
    monthFocus.addEventListener("change", () => {
      renderMonthlyIntelligence(getBaseResponsibleRecords());
    });
  }

  const printBtn = document.getElementById("printReportButton");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      document.body.classList.add("printing-report");
      window.print();
      window.setTimeout(() => document.body.classList.remove("printing-report"), 400);
    });
  }
}

async function loadData() {
  setLoading(true);
  setSyncState("loading");

  try {
    const response = await fetch(`${CSV_URL}&cache=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Falha ao carregar a planilha: HTTP ${response.status}`);
    }

    const csvText = await response.text();
    const rows = parseCSV(csvText);

    if (!rows.length) {
      throw new Error("A planilha não possui linhas de dados.");
    }

    state.records = normalizeRows(rows);
    populateYearFilter();
    renderDashboard();
    setSyncState("online");
    hideError();
  } catch (error) {
    console.error(error);
    setSyncState("error");
    showError(
      "Não foi possível ler os dados publicados. Confirme se a aba Lançamentos continua publicada como CSV."
    );
  } finally {
    setLoading(false);
  }
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(field.trim());
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  return rows;
}

function normalizeRows(rows) {
  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);

  return rows
    .slice(1)
    .filter((row) => row.some((value) => String(value).trim() !== ""))
    .map((row, index) => {
      const raw = {};

      headers.forEach((header, columnIndex) => {
        raw[header] = row[columnIndex] ?? "";
      });

      const dataBase =
        pick(raw, [
          "carimbodedatahora",
          "timestamp",
          "dataehora",
          "datadacompra",
          "data",
        ]) || "";

      const modelo =
        pick(raw, [
          "comoserapago",
          "comoserapago",
          "tipodepagamento",
          "pagamentoparcelado",
        ]) || "À vista";

      const parcelas = parseInteger(
        pick(raw, [
          "parcelasrestantes",
          "quantidadedeparcelas",
          "totaldeparcelas",
          "numerodeparcelas",
        ])
      );

      return {
        id: index + 1,
        data: parseDate(dataBase),
        dataOriginal: dataBase,
        responsavel: titleCase(pick(raw, ["responsavel"]) || "Não informado"),
        tipo: normalizeType(pick(raw, ["tipodelancamento", "tipo"]) || "Despesa"),
        categoria: titleCase(pick(raw, ["categoria"]) || "Outros"),
        descricao: pick(raw, ["descricao", "descricaodolancamento"]) || "Sem descrição",
        valor: parseMoney(pick(raw, ["valortotal", "valor"]) || "0"),
        formaPagamento:
          titleCase(
            pick(raw, ["formadepagamento", "pagamento", "forma"]) || "Não informado"
          ),
        modeloPagamento: normalizePaymentModel(modelo),
        parcelasRestantes: parcelas,
        frequencia:
          titleCase(
            pick(raw, ["frequencia", "periodicidade", "frequenciadarecorrencia"]) || ""
          ),
        raw,
      };
    });
}

function normalizeHeader(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function pick(object, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      const value = object[key];
      if (String(value).trim() !== "") {
        return String(value).trim();
      }
    }
  }
  return "";
}

function parseMoney(value) {
  const normalized = String(value)
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function parseInteger(value) {
  const number = Number.parseInt(String(value).replace(/\D/g, ""), 10);
  return Number.isFinite(number) ? number : 0;
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  const brDateTime = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (brDateTime) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = brDateTime;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const isoDate = new Date(text);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate;
}

function normalizeType(value) {
  const normalized = removeAccents(value).toLowerCase();
  if (normalized.includes("receita")) return "Receita";
  if (normalized.includes("econom")) return "Economia";
  return "Despesa";
}

function normalizePaymentModel(value) {
  const normalized = removeAccents(value).toLowerCase();
  if (normalized.includes("parcel")) return "Parcelado";
  if (normalized.includes("recorr")) return "Recorrente";
  return "À vista";
}

function removeAccents(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function titleCase(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function populateYearFilter() {
  const select = document.getElementById("anoFilter");
  const currentValue = select.value;

  const years = [...new Set(
    state.records
      .filter((record) => record.data)
      .map((record) => record.data.getFullYear())
  )].sort((a, b) => b - a);

  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) {
    years.unshift(currentYear);
  }

  select.innerHTML = `
    <option value="Todos">Todos</option>
    ${years.map((year) => `<option value="${year}">${year}</option>`).join("")}
  `;

  if ([...select.options].some((option) => option.value === currentValue)) {
    select.value = currentValue;
  } else {
    select.value = String(currentYear);
  }
}

function getFilteredRecords() {
  const responsible = document.getElementById("responsavelFilter").value;
  const selectedYear = document.getElementById("anoFilter").value;
  const period = document.getElementById("periodoFilter").value;

  return state.records.filter((record) => {
    const responsibleMatch =
      responsible === "Todos" || record.responsavel === responsible;
    const yearMatch =
      selectedYear === "Todos" ||
      (record.data && record.data.getFullYear() === Number(selectedYear));
    return responsibleMatch && yearMatch && dateMatchesPeriod(record.data, period);
  });
}

function dateMatchesPeriod(date, period) {
  if (period === "todos" || !date) return true;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "mesAtual") {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  }
  if (period === "anoAtual") {
    return date.getFullYear() === now.getFullYear();
  }
  const days = period === "30dias" ? 30 : 90;
  const start = new Date(startOfToday);
  start.setDate(start.getDate() - days);
  return date >= start && date <= now;
}

function renderDashboard() {
  const records = getFilteredRecords();
  renderKpis(records);
  renderFlowChart(records);
  renderCategoryChart(records);
  renderCommitmentSummary(records);
  renderPeopleComparison(records);
  renderRecentTable(records);
  renderProjection(records);
  renderCommitmentsTable(records);
  renderIntelligence();
  renderHistory();
}

function renderKpis(records) {
  const receitas = sumByType(records, "Receita");
  const despesas = sumByType(records, "Despesa");
  const economias = sumByType(records, "Economia");
  const saldo = receitas - despesas - economias;

  setText("saldoAtual", formatCurrency(saldo));
  setText("totalReceitas", formatCurrency(receitas));
  setText("totalDespesas", formatCurrency(despesas));
  setText("totalEconomias", formatCurrency(economias));
  setText("receitasDescricao", `${countByType(records, "Receita")} lançamento(s)`);
  setText("despesasDescricao", `${countByType(records, "Despesa")} lançamento(s)`);
  setText("economiasDescricao", `${countByType(records, "Economia")} lançamento(s)`);
}

function sumByType(records, type) {
  return records
    .filter((record) => record.tipo === type)
    .reduce((total, record) => total + record.valor, 0);
}

function countByType(records, type) {
  return records.filter((record) => record.tipo === type).length;
}

function renderFlowChart(records) {
  const months = getRecentMonths(6);
  const labels = months.map((month) => monthFormatter.format(month));
  const receitas = [];
  const despesas = [];

  months.forEach((month) => {
    receitas.push(sumMonthType(records, month, "Receita"));
    despesas.push(sumMonthType(records, month, "Despesa"));
  });

  if (state.charts.fluxo) {
    state.charts.fluxo.destroy();
  }

  state.charts.fluxo = new Chart(document.getElementById("fluxoChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Receitas",
          data: receitas,
          backgroundColor: "rgba(52, 211, 153, 0.72)",
          borderRadius: 9,
          maxBarThickness: 34,
        },
        {
          label: "Despesas",
          data: despesas,
          backgroundColor: "rgba(251, 113, 133, 0.72)",
          borderRadius: 9,
          maxBarThickness: 34,
        },
      ],
    },
    options: chartOptions(),
  });
}

function renderCategoryChart(records) {
  const categoryMap = {};

  records
    .filter((record) => record.tipo === "Despesa")
    .forEach((record) => {
      categoryMap[record.categoria] =
        (categoryMap[record.categoria] || 0) + record.valor;
    });

  const entries = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  const labels = entries.map(([category]) => category);
  const values = entries.map(([, value]) => value);
  const colors = [
    "#7c5cff",
    "#3dd9eb",
    "#34d399",
    "#fbbf24",
    "#fb7185",
    "#a78bfa",
    "#60a5fa",
  ];

  if (state.charts.categorias) {
    state.charts.categorias.destroy();
  }

  state.charts.categorias = new Chart(
    document.getElementById("categoriasChart"),
    {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderWidth: 0,
            hoverOffset: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.label}: ${formatCurrency(context.raw)}`;
              },
            },
          },
        },
      },
    }
  );

  const legend = document.getElementById("categoriaLegend");
  legend.innerHTML = entries.length
    ? entries
        .map(
          ([category, value], index) => `
            <div class="legend-item">
              <div class="legend-left">
                <span class="legend-dot" style="background:${colors[index]}"></span>
                <span>${escapeHTML(category)}</span>
              </div>
              <strong>${formatCurrency(value)}</strong>
            </div>
          `
        )
        .join("")
    : '<div class="empty-state">Sem despesas para exibir.</div>';
}

function renderCommitmentSummary(records) {
  const installments = records.filter(
    (record) => record.modeloPagamento === "Parcelado"
  );
  const recurring = records.filter(
    (record) => record.modeloPagamento === "Recorrente"
  );

  const futureInstallmentValue = installments.reduce(
    (total, record) =>
      total + record.valor * Math.max(record.parcelasRestantes, 0),
    0
  );
  const remainingInstallments = installments.reduce(
    (total, record) => total + Math.max(record.parcelasRestantes, 0),
    0
  );
  const monthlyRecurring = recurring.reduce(
    (total, record) => total + monthlyEquivalent(record),
    0
  );
  const nextMonthProjection = calculateMonthProjection(
    records,
    addMonths(startOfMonth(new Date()), 1)
  );

  setText("parceladoFuturo", formatCurrency(futureInstallmentValue));
  setText("parcelasRestantes", String(remainingInstallments));
  setText("recorrenciasMensais", formatCurrency(monthlyRecurring));
  setText("proximoMesProjetado", formatCurrency(nextMonthProjection.balance));
}

function renderPeopleComparison(records) {
  const victor = calculatePersonBalance(records, "Victor");
  const lara = calculatePersonBalance(records, "Lara");
  const maximum = Math.max(Math.abs(victor), Math.abs(lara), 1);

  setText("victorResumo", formatCurrency(victor));
  setText("laraResumo", formatCurrency(lara));

  document.getElementById("victorBar").style.width = `${
    (Math.abs(victor) / maximum) * 100
  }%`;
  document.getElementById("laraBar").style.width = `${
    (Math.abs(lara) / maximum) * 100
  }%`;
}

function calculatePersonBalance(records, person) {
  const personRecords = records.filter(
    (record) => record.responsavel === person
  );
  return (
    sumByType(personRecords, "Receita") -
    sumByType(personRecords, "Despesa") -
    sumByType(personRecords, "Economia")
  );
}

function renderRecentTable(records) {
  const tbody = document.getElementById("recentTableBody");
  const empty = document.getElementById("recentEmpty");

  const recent = [...records]
    .sort((a, b) => {
      const timeA = a.data ? a.data.getTime() : 0;
      const timeB = b.data ? b.data.getTime() : 0;
      return timeB - timeA || b.id - a.id;
    })
    .slice(0, 10);

  tbody.innerHTML = recent.map(recordRow).join("");
  empty.classList.toggle("hidden", recent.length > 0);
}

function recordRow(record) {
  return `
    <tr>
      <td>${formatDate(record.data, record.dataOriginal)}</td>
      <td>${escapeHTML(record.responsavel)}</td>
      <td><span class="badge ${record.tipo.toLowerCase()}">${record.tipo}</span></td>
      <td>${escapeHTML(record.categoria)}</td>
      <td>${escapeHTML(record.descricao)}</td>
      <td>${escapeHTML(record.modeloPagamento)}</td>
      <td class="value-cell">${formatCurrency(record.valor)}</td>
    </tr>
  `;
}

function historyRow(record) {
  return `
    <tr>
      <td>${formatDate(record.data, record.dataOriginal)}</td>
      <td>${escapeHTML(record.responsavel)}</td>
      <td><span class="badge ${record.tipo.toLowerCase()}">${record.tipo}</span></td>
      <td>${escapeHTML(record.categoria)}</td>
      <td>${escapeHTML(record.descricao)}</td>
      <td>${escapeHTML(record.formaPagamento)}</td>
      <td>${escapeHTML(record.modeloPagamento)}</td>
      <td class="value-cell">${formatCurrency(record.valor)}</td>
    </tr>
  `;
}

function renderHistory() {
  const tbody = document.getElementById("historyTableBody");
  const empty = document.getElementById("historyEmpty");
  const search = removeAccents(
    document.getElementById("historySearch").value
  ).toLowerCase();

  const records = getFilteredRecords()
    .filter((record) => {
      if (!search) return true;
      const haystack = removeAccents(
        `${record.descricao} ${record.categoria} ${record.responsavel} ${record.tipo}`
      ).toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => {
      const timeA = a.data ? a.data.getTime() : 0;
      const timeB = b.data ? b.data.getTime() : 0;
      return timeB - timeA || b.id - a.id;
    });

  tbody.innerHTML = records.map(historyRow).join("");
  empty.classList.toggle("hidden", records.length > 0);
}

function renderProjection(records) {
  const longestInstallment = records
    .filter((record) => record.modeloPagamento === "Parcelado")
    .reduce(
      (maximum, record) =>
        Math.max(maximum, Math.max(record.parcelasRestantes, 0)),
      0
    );

  const projectionMonths = Math.max(12, longestInstallment);
  const months = getFutureMonths(projectionMonths);
  const labels = months.map((month) => monthFormatter.format(month));
  const receipts = [];
  const expenses = [];
  const balances = [];

  months.forEach((month) => {
    const projection = calculateMonthProjection(records, month);
    receipts.push(projection.receipts);
    expenses.push(projection.expenses);
    balances.push(projection.balance);
  });

  if (state.charts.projecao) {
    state.charts.projecao.destroy();
  }

  state.charts.projecao = new Chart(document.getElementById("projecaoChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Receitas projetadas",
          data: receipts,
          borderColor: "#34d399",
          backgroundColor: "rgba(52, 211, 153, 0.12)",
          fill: false,
          tension: 0.32,
        },
        {
          label: "Despesas projetadas",
          data: expenses,
          borderColor: "#fb7185",
          backgroundColor: "rgba(251, 113, 133, 0.12)",
          fill: false,
          tension: 0.32,
        },
        {
          label: "Saldo projetado",
          data: balances,
          borderColor: "#7c5cff",
          backgroundColor: "rgba(124, 92, 255, 0.12)",
          fill: true,
          tension: 0.32,
        },
      ],
    },
    options: chartOptions(),
  });
}

function calculateMonthProjection(records, month) {
  let receipts = 0;
  let expenses = 0;
  let savings = 0;

  records.forEach((record) => {
    let amount = 0;

    if (record.modeloPagamento === "Recorrente") {
      amount = projectedRecurringAmount(record, month);
    } else if (record.modeloPagamento === "Parcelado") {
      amount = projectedInstallmentAmount(record, month);
    } else if (sameMonth(record.data, month)) {
      amount = record.valor;
    }

    if (record.tipo === "Receita") receipts += amount;
    if (record.tipo === "Despesa") expenses += amount;
    if (record.tipo === "Economia") savings += amount;
  });

  return {
    receipts,
    expenses,
    savings,
    balance: receipts - expenses - savings,
  };
}

function projectedInstallmentAmount(record, month) {
  const quantity = Math.max(record.parcelasRestantes, 0);
  if (!quantity) return 0;

  const firstMonth = addMonths(startOfMonth(record.data || new Date()), 1);
  const monthDistance = differenceInMonths(firstMonth, startOfMonth(month));

  if (monthDistance < 0 || monthDistance >= quantity) {
    return 0;
  }

  return record.valor;
}

function projectedRecurringAmount(record, month) {
  const start = addMonths(startOfMonth(record.data || new Date()), 1);

  if (startOfMonth(month) < start) {
    return 0;
  }

  const frequency = removeAccents(record.frequencia).toLowerCase();

  if (frequency.includes("seman")) return record.valor * 4.33;
  if (frequency.includes("quinzen")) return record.valor * 2;
  if (frequency.includes("bimes")) {
    return differenceInMonths(start, month) % 2 === 0 ? record.valor : 0;
  }
  if (frequency.includes("trimes")) {
    return differenceInMonths(start, month) % 3 === 0 ? record.valor : 0;
  }
  if (frequency.includes("semes")) {
    return differenceInMonths(start, month) % 6 === 0 ? record.valor : 0;
  }
  if (frequency.includes("anual")) {
    return differenceInMonths(start, month) % 12 === 0 ? record.valor : 0;
  }

  return record.valor;
}

function monthlyEquivalent(record) {
  const frequency = removeAccents(record.frequencia).toLowerCase();

  if (frequency.includes("seman")) return record.valor * 4.33;
  if (frequency.includes("quinzen")) return record.valor * 2;
  if (frequency.includes("bimes")) return record.valor / 2;
  if (frequency.includes("trimes")) return record.valor / 3;
  if (frequency.includes("semes")) return record.valor / 6;
  if (frequency.includes("anual")) return record.valor / 12;

  return record.valor;
}

function renderCommitmentsTable(records) {
  const tbody = document.getElementById("commitmentsTableBody");
  const empty = document.getElementById("commitmentsEmpty");

  const commitments = records.filter((record) =>
    ["Parcelado", "Recorrente"].includes(record.modeloPagamento)
  );

  tbody.innerHTML = commitments
    .map((record) => {
      const monthlyValue =
        record.modeloPagamento === "Parcelado"
          ? record.valor
          : monthlyEquivalent(record);

      const duration =
        record.modeloPagamento === "Parcelado"
          ? `${record.parcelasRestantes} parcela(s)`
          : record.frequencia || "Mensal";

      return `
        <tr>
          <td>${escapeHTML(record.responsavel)}</td>
          <td>${escapeHTML(record.descricao)}</td>
          <td>${escapeHTML(record.modeloPagamento)}</td>
          <td class="value-cell">${formatCurrency(monthlyValue)}</td>
          <td>${escapeHTML(duration)}</td>
        </tr>
      `;
    })
    .join("");

  empty.classList.toggle("hidden", commitments.length > 0);
}

function sumMonthType(records, month, type) {
  return records
    .filter((record) => record.tipo === type && sameMonth(record.data, month))
    .reduce((total, record) => total + record.valor, 0);
}

function sameMonth(dateA, dateB) {
  if (!dateA || !dateB) return false;
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth()
  );
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, quantity) {
  return new Date(date.getFullYear(), date.getMonth() + quantity, 1);
}

function differenceInMonths(start, end) {
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    end.getMonth() -
    start.getMonth()
  );
}

function getRecentMonths(quantity) {
  const now = new Date();
  const months = [];
  for (let index = quantity - 1; index >= 0; index -= 1) {
    months.push(new Date(now.getFullYear(), now.getMonth() - index, 1));
  }
  return months;
}

function getFutureMonths(quantity) {
  const now = new Date();
  const months = [];
  for (let index = 1; index <= quantity; index += 1) {
    months.push(new Date(now.getFullYear(), now.getMonth() + index, 1));
  }
  return months;
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: "index",
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: "#8d98b3",
          autoSkip: true,
          maxTicksLimit: 18,
          maxRotation: 0,
          font: { size: 10 },
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(255, 255, 255, 0.06)" },
        ticks: {
          color: "#8d98b3",
          callback(value) {
            return compactCurrency(value);
          },
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: "#aeb7cc",
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: "circle",
        },
      },
      tooltip: {
        callbacks: {
          label(context) {
            return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
          },
        },
      },
    },
  };
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function compactCurrency(value) {
  const number = Number(value) || 0;

  if (Math.abs(number) >= 1_000_000) {
    return `R$ ${(number / 1_000_000).toFixed(1)} mi`;
  }
  if (Math.abs(number) >= 1_000) {
    return `R$ ${(number / 1_000).toFixed(1)} mil`;
  }
  return `R$ ${number.toFixed(0)}`;
}

function formatDate(date, fallback = "") {
  return date ? dateFormatter.format(date) : escapeHTML(fallback || "—");
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function setLoading(isLoading) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) {
    overlay.classList.toggle("hidden", !isLoading);
  }
}

function setSyncState(status) {
  const dot = document.getElementById("statusDot");
  const label = document.getElementById("syncLabel");
  const lastSync = document.getElementById("lastSync");

  dot.classList.remove("online", "error");

  if (status === "online") {
    dot.classList.add("online");
    label.textContent = "Dados atualizados";
    lastSync.textContent = `Última leitura às ${new Date().toLocaleTimeString(
      "pt-BR",
      { hour: "2-digit", minute: "2-digit" }
    )}`;
    return;
  }

  if (status === "error") {
    dot.classList.add("error");
    label.textContent = "Erro de conexão";
    lastSync.textContent = "Verifique a publicação CSV";
    return;
  }

  label.textContent = "Conectando";
  lastSync.textContent = "Buscando lançamentos";
}

function showError(message) {
  const errorBox = document.getElementById("errorBox");
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function hideError() {
  document.getElementById("errorBox").classList.add("hidden");
}

function getBaseResponsibleRecords() {
  const responsible = document.getElementById("responsavelFilter").value;
  return state.records.filter(
    (record) => responsible === "Todos" || record.responsavel === responsible
  );
}

function renderIntelligence() {
  const records = getBaseResponsibleRecords();
  renderLongTermTimeline(records);
  renderAnomalies(records);
  renderMonthlyIntelligence(records);
}

function getProjectionHorizonMonths(records) {
  const longest = records
    .filter((record) => record.modeloPagamento === "Parcelado")
    .reduce((max, record) => Math.max(max, record.parcelasRestantes), 0);
  return Math.max(120, longest);
}

function renderLongTermTimeline(records) {
  const start = addMonths(startOfMonth(new Date()), 1);
  const horizon = getProjectionHorizonMonths(records);
  const yearly = new Map();

  for (let offset = 0; offset < horizon; offset += 1) {
    const month = addMonths(start, offset);
    const projection = calculateMonthProjection(records, month);
    const year = month.getFullYear();
    const item = yearly.get(year) || { income: 0, expenses: 0, savings: 0, balance: 0 };
    item.income += projection.receipts;
    item.expenses += projection.expenses;
    item.savings += projection.savings;
    item.balance += projection.balance;
    yearly.set(year, item);
  }

  const entries = [...yearly.entries()];
  const labels = entries.map(([year]) => String(year));
  const balances = entries.map(([, values]) => values.balance);
  const expenses = entries.map(([, values]) => values.expenses + values.savings);

  if (state.charts.timeline) state.charts.timeline.destroy();
  state.charts.timeline = new Chart(document.getElementById("timelineChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Compromissos",
          data: expenses,
          backgroundColor: "rgba(251,113,133,.68)",
          borderRadius: 7,
        },
        {
          label: "Saldo",
          data: balances,
          backgroundColor: "rgba(52,211,153,.68)",
          borderRadius: 7,
        },
      ],
    },
    options: chartOptions(),
  });

  const mostExpensive = entries.reduce((best, current) =>
    !best ||
    current[1].expenses + current[1].savings >
      best[1].expenses + best[1].savings
      ? current
      : best,
    null
  );
  const lastInstallment = records
    .filter(
      (record) =>
        record.modeloPagamento === "Parcelado" &&
        record.parcelasRestantes > 0 &&
        record.data
    )
    .map((record) => ({
      record,
      end: addMonths(startOfMonth(record.data), record.parcelasRestantes),
    }))
    .sort((a, b) => b.end - a.end)[0];

  document.getElementById("timelineSummary").innerHTML = `
    <div><span>Horizonte analisado</span><strong>${horizon} meses</strong></div>
    <div><span>Ano mais comprometido</span><strong>${
      mostExpensive ? mostExpensive[0] : "—"
    }</strong></div>
    <div><span>Último parcelamento</span><strong>${
      lastInstallment ? monthYearLabel(lastInstallment.end) : "Nenhum"
    }</strong></div>
  `;

  document.getElementById("timelineTableBody").innerHTML = entries
    .map(
      ([year, values]) => `
    <tr>
      <td>${year}</td>
      <td class="value-cell">${formatCurrency(values.income)}</td>
      <td class="value-cell">${formatCurrency(values.expenses)}</td>
      <td class="value-cell">${formatCurrency(values.savings)}</td>
      <td class="value-cell ${
        values.balance < 0 ? "negative-text" : "positive-text"
      }">${formatCurrency(values.balance)}</td>
    </tr>`
    )
    .join("");
}

function renderAnomalies(records) {
  const anomalies = [];
  const actualExpenses = records.filter((r) => r.tipo === "Despesa" && r.data);
  const monthlyTotals = new Map();
  actualExpenses.forEach((r) => {
    const key = `${r.data.getFullYear()}-${String(r.data.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + r.valor);
  });
  const totals = [...monthlyTotals.values()];
  const average = totals.length
    ? totals.reduce((a, b) => a + b, 0) / totals.length
    : 0;
  const currentKey = toMonthInputValue(new Date());
  const currentTotal = monthlyTotals.get(currentKey) || 0;
  if (average > 0 && currentTotal > average * 1.25) {
    anomalies.push({
      level: "warning",
      title: "Despesas acima do padrão",
      text: `O mês atual está ${Math.round(
        (currentTotal / average - 1) * 100
      )}% acima da média histórica mensal.`,
    });
  }

  const duplicateGroups = new Map();
  records.forEach((r) => {
    if (!r.data) return;
    const key = [
      r.responsavel,
      r.tipo,
      removeAccents(r.descricao).toLowerCase(),
      r.valor.toFixed(2),
      r.data.toDateString(),
    ].join("|");
    duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), r]);
  });
  const duplicate = [...duplicateGroups.values()].find((group) => group.length > 1);
  if (duplicate) {
    anomalies.push({
      level: "danger",
      title: "Possível lançamento duplicado",
      text: `${duplicate.length} registros iguais de “${duplicate[0].descricao}” no mesmo dia.`,
    });
  }

  const categories = {};
  actualExpenses.forEach((r) => (categories[r.categoria] = (categories[r.categoria] || 0) + r.valor));
  const totalExpenses = Object.values(categories).reduce((a, b) => a + b, 0);
  const dominant = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  if (dominant && totalExpenses && dominant[1] / totalExpenses >= 0.45) {
    anomalies.push({
      level: "info",
      title: "Alta concentração de gastos",
      text: `${dominant[0]} representa ${Math.round(
        (dominant[1] / totalExpenses) * 100
      )}% das despesas registradas.`,
    });
  }

  const nextMonths = getFutureMonths(12).map((month) => ({
    month,
    ...calculateMonthProjection(records, month),
  }));
  const negative = nextMonths.find((item) => item.balance < 0);
  if (negative) {
    anomalies.push({
      level: "danger",
      title: "Mês futuro com saldo negativo",
      text: `${monthYearLabel(negative.month)} apresenta déficit projetado de ${formatCurrency(
        Math.abs(negative.balance)
      )}.`,
    });
  }
  const peak = nextMonths.reduce((best, item) =>
    !best ||
    item.expenses + item.savings > best.expenses + best.savings
      ? item
      : best,
    null
  );
  if (peak) {
    anomalies.push({
      level: "info",
      title: "Pico de compromissos",
      text: `${monthYearLabel(peak.month)} é o mês mais comprometido dos próximos 12 meses, com ${formatCurrency(
        peak.expenses + peak.savings
      )}.`,
    });
  }

  if (!anomalies.length) {
    anomalies.push({
      level: "success",
      title: "Nenhuma anomalia relevante",
      text: "Os lançamentos atuais não apresentam desvios significativos pelos critérios analisados.",
    });
  }
  document.getElementById("anomalyList").innerHTML = anomalies
    .map(
      (a) => `
    <div class="anomaly-card ${a.level}">
      <span class="anomaly-dot"></span>
      <div>
        <strong>${escapeHTML(a.title)}</strong>
        <p>${escapeHTML(a.text)}</p>
      </div>
    </div>`
    )
    .join("");
}

function renderMonthlyIntelligence(records) {
  const input = document.getElementById("monthFocus");
  if (!input) return;
  const month = parseMonthInput(input.value) || startOfMonth(new Date());
  const items = getProjectedItemsForMonth(records, month);
  const totals = items.reduce(
    (acc, item) => {
      acc[item.type] += item.value;
      return acc;
    },
    { Receita: 0, Despesa: 0, Economia: 0 }
  );
  const balance = totals.Receita - totals.Despesa - totals.Economia;

  setText("monthIncome", formatCurrency(totals.Receita));
  setText("monthExpenses", formatCurrency(totals.Despesa));
  setText("monthSavings", formatCurrency(totals.Economia));
  setText("monthBalance", formatCurrency(balance));
  document.getElementById("monthBalance").className = balance < 0 ? "negative-text" : "positive-text";

  const groups = ["Receita", "Despesa", "Economia"]
    .map((type) => {
      const groupItems = items.filter((item) => item.type === type);
      if (!groupItems.length) return "";
      return `<section class="monthly-group"><h3>${
        type === "Receita"
          ? "Receitas previstas"
          : type === "Despesa"
          ? "Despesas previstas"
          : "Economias previstas"
      }</h3>${groupItems
        .map(
          (item) => `
      <div class="monthly-item">
        <div>
          <strong>${escapeHTML(item.description)}</strong>
          <span>${escapeHTML(item.responsible)} · ${escapeHTML(item.source)}${
            item.remainingLabel ? ` · ${escapeHTML(item.remainingLabel)}` : ""
          }</span>
        </div>
        <b>${formatCurrency(item.value)}</b>
      </div>`
        )
        .join("")}</section>`;
    })
    .join("");
  document.getElementById("monthlyGroups").innerHTML =
    groups || '<div class="empty-state">Nenhum movimento previsto para este mês.</div>';
  renderMonthlyClosing(records, month, items, totals, balance);
}

function getProjectedItemsForMonth(records, month) {
  const items = [];
  records.forEach((record) => {
    let value = 0,
      source = "Lançamento",
      remainingLabel = "";
    if (record.modeloPagamento === "Parcelado") {
      value = projectedInstallmentAmount(record, month);
      source = "Parcelado";
      if (value > 0 && record.data) {
        const elapsed = differenceInMonths(
          addMonths(startOfMonth(record.data), 1),
          month
        );
        remainingLabel = `${Math.max(
          record.parcelasRestantes - elapsed,
          0
        )} restante(s)`;
      }
    } else if (record.modeloPagamento === "Recorrente") {
      value = projectedRecurringAmount(record, month);
      source = record.frequencia || "Recorrente";
    } else if (sameMonth(record.data, month)) {
      value = record.valor;
    }
    if (value > 0) {
      items.push({
        type: record.tipo,
        value,
        description: record.descricao,
        responsible: record.responsavel,
        source,
        remainingLabel,
      });
    }
  });
  return items.sort((a, b) => b.value - a.value);
}

function renderMonthlyClosing(records, month, items, totals, balance) {
  const previous = addMonths(month, -1);
  const previousItems = getProjectedItemsForMonth(records, previous);
  const previousTotals = previousItems.reduce(
    (acc, item) => {
      acc[item.type] += item.value;
      return acc;
    },
    { Receita: 0, Despesa: 0, Economia: 0 }
  );
  const previousBalance =
    previousTotals.Receita - previousTotals.Despesa - previousTotals.Economia;
  const variation =
    previousBalance === 0
      ? null
      : (balance - previousBalance) / Math.abs(previousBalance) * 100;
  const expenseItems = items.filter((item) => item.type === "Despesa");
  const largest = expenseItems[0];
  const byCategory = {};
  records
    .filter((r) => r.tipo === "Despesa")
    .forEach((r) => {
      const value =
        r.modeloPagamento === "Parcelado"
          ? projectedInstallmentAmount(r, month)
          : r.modeloPagamento === "Recorrente"
          ? projectedRecurringAmount(r, month)
          : sameMonth(r.data, month)
          ? r.valor
          : 0;
      if (value > 0) byCategory[r.categoria] = (byCategory[r.categoria] || 0) + value;
    });
  const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];

  setText("closingPeriodLabel", `Fechamento projetado de ${monthYearLabel(month)}.`);
  document.getElementById("closingScorecards").innerHTML = `
    <div><span>Receitas</span><strong>${formatCurrency(totals.Receita)}</strong></div>
    <div><span>Despesas</span><strong>${formatCurrency(totals.Despesa)}</strong></div>
    <div><span>Economias</span><strong>${formatCurrency(totals.Economia)}</strong></div>
    <div><span>Resultado líquido</span><strong class="${
      balance < 0 ? "negative-text" : "positive-text"
    }">${formatCurrency(balance)}</strong></div>`;
  const comparison =
    variation === null
      ? "Sem base suficiente para comparação com o mês anterior."
      : `O resultado está ${Math.abs(variation).toFixed(
          1
        )}% ${variation >= 0 ? "melhor" : "pior"} que no mês anterior.`;
  document.getElementById("closingInsights").innerHTML = `
    <div><span>Comparação mensal</span><strong>${escapeHTML(comparison)}</strong></div>
    <div><span>Maior despesa</span><strong>${
      largest
        ? `${escapeHTML(largest.description)} — ${formatCurrency(largest.value)}`
        : "Nenhuma"
    }</strong></div>
    <div><span>Categoria dominante</span><strong>${
      topCategory
        ? `${escapeHTML(topCategory[0])} — ${formatCurrency(topCategory[1])}`
        : "Nenhuma"
    }</strong></div>
    <div><span>Diagnóstico</span><strong>${
      balance < 0
        ? "Mês projetado em déficit. Reveja compromissos ou amplie receitas."
        : "Mês projetado com saldo positivo."
    }</strong></div>`;
}

function toMonthInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function parseMonthInput(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : null;
}
function monthYearLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(date)
    .replace(/^./, (c) => c.toUpperCase());
}

/* =========================================================
   Inclusão de nota por OCR — envio direto para Google Forms
   ========================================================= */
function bindNoteInclusion() {
  const modal = document.getElementById("noteModal");
  const openButton = document.getElementById("openNoteButton");
  const closeButton = document.getElementById("closeNoteButton");
  const imageInput = document.getElementById("noteImageInput");
  const processButton = document.getElementById("processNoteButton");
  const submitButton = document.getElementById("submitNoteButton");

  if (
    !modal ||
    !openButton ||
    !closeButton ||
    !imageInput ||
    !processButton ||
    !submitButton
  ) {
    console.warn("Elementos do modal de nota não encontrados.");
    return;
  }

  openButton.addEventListener("click", openNoteModal);
  closeButton.addEventListener("click", closeNoteModal);
  modal.querySelectorAll("[data-close-note]").forEach((element) => {
    element.addEventListener("click", closeNoteModal);
  });

  imageInput.addEventListener("change", () => {
    const file = imageInput.files && imageInput.files[0];
    processButton.disabled = !file;
    document.getElementById("noteExtracted").classList.add("hidden");
    hideNoteStatus();

    if (!file) {
      document.getElementById("notePreviewArea").classList.add("hidden");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      document.getElementById("notePreview").src = event.target.result;
      document.getElementById("notePreviewArea").classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  processButton.addEventListener("click", processNoteImage);
  submitButton.addEventListener("click", submitNoteToForms);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden"))
      closeNoteModal();
  });
}

function openNoteModal() {
  resetNoteForm();
  const modal = document.getElementById("noteModal");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("note-modal-open");
  document.getElementById("noteResponsavel").focus();
}

function closeNoteModal() {
  const modal = document.getElementById("noteModal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("note-modal-open");
}

function resetNoteForm() {
  document.getElementById("noteResponsavel").value = "";
  document.getElementById("noteCategoria").value = "";
  document.getElementById("noteImageInput").value = "";
  document.getElementById("noteDescricao").value = "";
  document.getElementById("noteValor").value = "";
  document.getElementById("noteFormaPagamento").value = "";
  document.getElementById("processNoteButton").disabled = true;
  document.getElementById("notePreviewArea").classList.add("hidden");
  document.getElementById("noteExtracted").classList.add("hidden");
  document.getElementById("noteProgress").classList.add("hidden");
  document.getElementById("noteProgressBar").style.width = "0%";
  hideNoteStatus();
}

async function processNoteImage() {
  const file = document.getElementById("noteImageInput").files[0];
  if (!file) return showNoteStatus("Selecione uma imagem da nota.", "error");

  const responsible = document.getElementById("noteResponsavel").value;
  const category = document.getElementById("noteCategoria").value;
  if (!responsible || !category) {
    return showNoteStatus(
      "Selecione o responsável e a categoria antes de ler a nota.",
      "error"
    );
  }

  const button = document.getElementById("processNoteButton");
  const progress = document.getElementById("noteProgress");
  const bar = document.getElementById("noteProgressBar");
  button.disabled = true;
  progress.classList.remove("hidden");
  bar.style.width = "18%";
  showNoteStatus("Lendo a imagem e identificando os dados da nota...");

  try {
    const base64 = await fileToDataUrl(file);
    const formData = new FormData();
    formData.append("base64Image", base64);
    formData.append("apikey", OCR_API_KEY);
    formData.append("language", "por");
    formData.append("OCREngine", "2");
    formData.append("scale", "true");
    formData.append("isTable", "true");

    bar.style.width = "48%";
    const response = await fetch(OCR_URL, { method: "POST", body: formData });
    if (!response.ok)
      throw new Error(`Falha na leitura da nota (HTTP ${response.status}).`);

    const result = await response.json();
    bar.style.width = "82%";
    const parsedText = result?.ParsedResults?.[0]?.ParsedText || "";
    if (!parsedText.trim()) throw new Error("Nenhum texto foi reconhecido na imagem.");

    const extracted = extractNoteFields(parsedText);
    document.getElementById("noteDescricao").value =
      extracted.establishment || "Estabelecimento não identificado";
    document.getElementById("noteValor").value = extracted.value || "";
    document.getElementById("noteFormaPagamento").value =
      extracted.paymentMethod || "Não identificado";
    document.getElementById("noteExtracted").classList.remove("hidden");
    bar.style.width = "100%";
    showNoteStatus("Leitura concluída. Confira os dados antes de confirmar.", "success");
  } catch (error) {
    console.error(error);
    showNoteStatus(error.message || "Não foi possível processar a nota.", "error");
  } finally {
    button.disabled = false;
  }
}

function extractNoteFields(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    establishment: extractNoteEstablishment(lines),
    value: extractNoteTotal(text, lines),
    paymentMethod: extractNotePaymentMethod(text, lines),
  };
}

function extractNoteEstablishment(lines) {
  const ignored = /^(CNPJ|CPF|IE|IM|ENDERE|RUA|AV\.?|DOCUMENTO|EXTRATO|CUPOM|NOTA|SAT|NFC|DANFE|DATA|HORA|TEL|WWW)/i;
  for (const line of lines.slice(0, 10)) {
    const cleaned = line.replace(/\s{2,}/g, " ").trim();
    if (
      cleaned.length >= 4 &&
      /[A-Za-zÀ-ÿ]/.test(cleaned) &&
      !ignored.test(cleaned) &&
      !/^\d+[\d .\/-]*$/.test(cleaned)
    ) {
      return titleCase(cleaned.substring(0, 90));
    }
  }
  return "";
}

function extractNotePaymentMethod(text, lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = removeAccents(lines[index]).toUpperCase();
    if (
      normalized.includes("FORMA DE PAGAMENTO") ||
      normalized.includes("FORMA PAGTO")
    ) {
      const next = lines[index + 1] || "";
      if (next.length >= 3) return normalizeNotePaymentMethod(next);
    }
  }
  return normalizeNotePaymentMethod(text);
}

function normalizeNotePaymentMethod(value) {
  const normalized = removeAccents(value).toUpperCase();
  if (/PIX/.test(normalized)) return "Pix";
  if (/DEBITO/.test(normalized)) return "Cartão de débito";
  if (/CREDITO/.test(normalized)) return "Cartão de crédito";
  if (/DINHEIRO|ESPECIE/.test(normalized)) return "Dinheiro";
  if (/VOUCHER|VALE/.test(normalized)) return "Voucher";
  if (/CARTAO/.test(normalized)) return "Cartão";
  return String(value).replace(/\s{2,}/g, " ").trim().substring(0, 80);
}

function extractNoteTotal(text, lines) {
  const priority = ["VALOR TOTAL", "TOTAL A PAGAR", "VALOR A PAGAR", "TOTAL R$", "TOTAL"];
  for (const term of priority) {
    for (let index = 0; index < lines.length; index += 1) {
      const normalized = removeAccents(lines[index]).toUpperCase();
      if (
        !normalized.includes(term) ||
        normalized.includes("QUANTIDADE") ||
        normalized.includes("DESCONTO")
      )
        continue;
      for (const source of [lines[index], lines[index + 1] || "", lines[index + 2] || ""]) {
        const values = findNoteCurrencyValues(source);
        if (values.length) return currencyFormatter.format(values[values.length - 1]);
      }
    }
  }
  const allValues = findNoteCurrencyValues(text).filter((value) => value > 0);
  return allValues.length
    ? currencyFormatter.format(allValues[allValues.length - 1])
    : "";
}

function findNoteCurrencyValues(source) {
  const matches =
    String(source).match(
      /(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}|(?:R\$\s*)?\d+(?:[.,]\d{2})/g
    ) || [];
  return matches
    .map((value) => parseMoney(value))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

async function submitNoteToForms() {
  const responsible = document.getElementById("noteResponsavel").value;
  const category = document.getElementById("noteCategoria").value;
  const description = document.getElementById("noteDescricao").value.trim();
  const amountRaw = document.getElementById("noteValor").value;
  const paymentMethod = document.getElementById("noteFormaPagamento").value.trim();

  if (!responsible || !category || !description || !amountRaw) {
    return showNoteStatus(
      "Preencha responsável, categoria, descrição e valor antes de enviar.",
      "error"
    );
  }

  const amount = parseMoney(amountRaw);
  if (!amount || amount <= 0) {
    return showNoteStatus(
      "Valor inválido. Use formato como 185,90 ou 185.90.",
      "error"
    );
  }

  // 👇 CORREÇÃO: usar URLSearchParams (x-www-form-urlencoded)
  const params = new URLSearchParams();
  params.append("entry.680682825", description);
  params.append("entry.83532577", "Despesa");
  params.append("entry.228518281", category);
  params.append("entry.1422234492", paymentMethod || "Não informado");
  params.append("entry.844975634", "Pago");
  params.append("entry.853825704", description);
  params.append("entry.2025566254", amount.toFixed(2).replace(".", ","));

  const submitBtn = document.getElementById("submitNoteButton");
  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";
  showNoteStatus("Enviando dados para o Google Forms...");

  try {
    await fetch(FORMS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    showNoteStatus("Dados enviados com sucesso! Atualizando o painel...", "success");
    setTimeout(() => {
      closeNoteModal();
      loadData();
    }, 2000);
  } catch (error) {
    console.error("Erro ao enviar para o Forms:", error);
    showNoteStatus("Erro ao enviar. Verifique sua conexão e tente novamente.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirmar inclusão";
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error("Não foi possível abrir a imagem selecionada."));
    reader.readAsDataURL(file);
  });
}

function showNoteStatus(message, type = "") {
  const status = document.getElementById("noteStatus");
  status.textContent = message;
  status.className = `note-status${type ? ` ${type}` : ""}`;
  status.classList.remove("hidden");
}

function hideNoteStatus() {
  const status = document.getElementById("noteStatus");
  status.textContent = "";
  status.className = "note-status hidden";
}
