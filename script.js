const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQc3dcLg-Fi78H6M00At-eTfmeeQMghVK-Oy3w5XSX7QBXPNTLNZiGmlzt2Va5SqRgYhR5GqBo13fGE/pub?gid=2088244644&single=true&output=csv";

const state = {
  records: [],
  charts: {
    fluxo: null,
    categorias: null,
    projecao: null,
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
        historico: "Histórico",
      };

      document.querySelector(".topbar h1").textContent = titleMap[target] || "CasaDin";
    });
  });
}

function bindFilters() {
  document
    .getElementById("responsavelFilter")
    .addEventListener("change", renderDashboard);

  document
    .getElementById("periodoFilter")
    .addEventListener("change", renderDashboard);

  document
    .getElementById("refreshButton")
    .addEventListener("click", loadData);

  document
    .getElementById("historySearch")
    .addEventListener("input", renderHistory);
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
  if (!value) {
    return null;
  }

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

function getFilteredRecords() {
  const responsible = document.getElementById("responsavelFilter").value;
  const period = document.getElementById("periodoFilter").value;

  return state.records.filter((record) => {
    const responsibleMatch =
      responsible === "Todos" || record.responsavel === responsible;

    return responsibleMatch && dateMatchesPeriod(record.data, period);
  });
}

function dateMatchesPeriod(date, period) {
  if (period === "todos" || !date) {
    return true;
  }

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

  setText(
    "receitasDescricao",
    `${countByType(records, "Receita")} lançamento(s)`
  );

  setText(
    "despesasDescricao",
    `${countByType(records, "Despesa")} lançamento(s)`
  );

  setText(
    "economiasDescricao",
    `${countByType(records, "Economia")} lançamento(s)`
  );
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
          legend: {
            display: false,
          },
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
    (total, record) => total + record.valor,
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
  const months = getFutureMonths(12);
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

  if (!quantity) {
    return 0;
  }

  const firstMonth = addMonths(startOfMonth(record.data || new Date()), 1);
  const monthDistance = differenceInMonths(firstMonth, startOfMonth(month));

  if (monthDistance < 0 || monthDistance >= quantity) {
    return 0;
  }

  /*
   * Regra definida no projeto:
   * o valor cadastrado é tratado como valor total do compromisso parcelado.
   * A parcela mensal é calculada automaticamente.
   */
  return record.valor / quantity;
}

function projectedRecurringAmount(record, month) {
  const start = startOfMonth(record.data || new Date());

  if (startOfMonth(month) < start) {
    return 0;
  }

  const frequency = removeAccents(record.frequencia).toLowerCase();

  if (frequency.includes("seman")) {
    return record.valor * 4.33;
  }

  if (frequency.includes("quinzen")) {
    return record.valor * 2;
  }

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
          ? record.parcelasRestantes > 0
            ? record.valor / record.parcelasRestantes
            : 0
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
        grid: {
          display: false,
        },
        ticks: {
          color: "#8d98b3",
          font: {
            size: 10,
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(255, 255, 255, 0.06)",
        },
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
  document
    .getElementById("loadingOverlay")
    .classList.toggle("hidden", !isLoading);
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
