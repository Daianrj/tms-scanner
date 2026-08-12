(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    MAX = 2000,
    POR_PAG = 30;
  let arquivos = [],
    workers = [],
    resultados = [],
    erros = [],
    cancelado = false,
    pagina = 1,
    filtro = "";
  const moeda = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }),
    numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
  document.addEventListener("DOMContentLoaded", async () => {
    $("arquivos").onchange = (e) => selecionar([...e.target.files]);
    $("analisar").onclick = analisar;
    $("cancelar").onclick = cancelar;
    $("limpar").onclick = limpar;
    $("busca").oninput = (e) => {
      filtro = e.target.value.toLowerCase();
      pagina = 1;
      render();
    };
    $("anterior").onclick = () => {
      pagina = Math.max(1, pagina - 1);
      render();
    };
    $("proxima").onclick = () => {
      pagina++;
      render();
    };
    $("exportarCsv").onclick = csv;
    $("enviarTms").onclick = enviar;
    const d = $("dropArea");
    ["dragenter", "dragover"].forEach((n) =>
      d.addEventListener(n, (e) => {
        e.preventDefault();
        d.classList.add("drag");
      }),
    );
    ["dragleave", "drop"].forEach((n) =>
      d.addEventListener(n, (e) => {
        e.preventDefault();
        d.classList.remove("drag");
      }),
    );
    d.addEventListener("drop", (e) => selecionar([...e.dataTransfer.files]));
    const salvos = await TmsDB.listar();
    if (salvos.length) {
      resultados = salvos;
      $("estadoMotor").textContent = "Fila recuperada";
      atualizar();
      render();
    }
  });
  function selecionar(fs) {
    arquivos = fs.filter((f) => /\.(xml|zip)$/i.test(f.name));
    $("selecao").textContent =
      arquivos.length +
      " arquivo(s) selecionado(s) • " +
      bytes(arquivos.reduce((s, f) => s + f.size, 0));
  }
  async function analisar() {
    if (!arquivos.length) return alert("Selecione XMLs ou ZIPs.");
    cancelado = false;
    resultados = [];
    erros = [];
    await TmsDB.limpar();
    estado("Preparando Workers…");
    bloquear(true);
    const fila = arquivos.map((f, i) => ({ f, id: i })),
      total = fila.length,
      n = Math.min(
        Math.max(2, (navigator.hardwareConcurrency || 4) - 1),
        4,
        total,
      ),
      map = new Map();
    let concluidos = 0;
    await new Promise((resolve) => {
      for (let i = 0; i < n; i++) {
        const w = new Worker("./xml-worker.js?v=1.9.1");
        workers.push(w);
        w.onmessage = async (e) => {
          const m = e.data;
          if (m.tipo === "pulso") {
            estado("Lendo conteúdo compactado…");
            return;
          }
          if (m.tipo === "resultado") {
            const job = map.get(w);
            map.delete(w);
            resultados.push(...m.registros);
            erros.push(...m.erros);
            concluidos++;
            await persistir(m.registros);
            progresso(
              Math.round((concluidos / total) * 100),
              "Processados " + concluidos + " de " + total + " arquivo(s)",
            );
            if (cancelado || !despachar(w)) {
              w.terminate();
              if (
                workers.every((x) => x === null || map.has(x) === false) &&
                concluidos >= total
              )
                resolve();
            }
            if (concluidos >= total) resolve();
          }
        };
        despachar(w);
      }
    });
    workers.forEach((w) => w && w.terminate());
    workers = [];
    deduplicar();
    await TmsDB.limpar();
    for (let i = 0; i < resultados.length; i += 100)
      await TmsDB.salvarLote(resultados.slice(i, i + 100));
    await TmsDB.meta({
      data: new Date().toISOString(),
      total: resultados.length,
      erros: erros.length,
    });
    bloquear(false);
    progresso(
      100,
      cancelado
        ? "Processamento cancelado."
        : "Análise concluída e salva localmente.",
    );
    atualizar();
    render();
    function despachar(w) {
      if (cancelado || !fila.length) return false;
      const j = fila.shift();
      map.set(w, j);
      j.f
        .arrayBuffer()
        .then((buffer) =>
          w.postMessage(
            { tipo: "processar", id: j.id, nome: j.f.name, buffer },
            [buffer],
          ),
        );
      return true;
    }
  }
  async function persistir(r) {
    if (r.length) await TmsDB.salvarLote(r);
  }
  function deduplicar() {
    const m = new Map(),
      dup = [];
    for (const r of resultados) {
      if (m.has(r.chave)) dup.push(r);
      else m.set(r.chave, r);
    }
    resultados = [...m.values()];
    window.__duplicados = dup.length;
  }
  function cancelar() {
    cancelado = true;
    workers.forEach((w) => w && w.postMessage({ tipo: "cancelar" }));
    estado("Cancelamento solicitado…");
  }
  async function limpar() {
    if (!confirm("Limpar a fila local e a prévia?")) return;
    await TmsDB.limpar();
    resultados = [];
    erros = [];
    arquivos = [];
    $("arquivos").value = "";
    $("selecao").textContent = "Nenhum arquivo selecionado.";
    progresso(0, "Fila local limpa.");
    atualizar();
    render();
  }
  function filtrar() {
    if (!filtro) return resultados;
    return resultados.filter((r) =>
      [r.nf, r.cliente, r.pedido, r.cpfCnpj, r.vendedor]
        .join(" ")
        .toLowerCase()
        .includes(filtro),
    );
  }
  function render() {
    const a = filtrar(),
      max = Math.max(1, Math.ceil(a.length / POR_PAG));
    pagina = Math.min(pagina, max);
    const fat = a.slice((pagina - 1) * POR_PAG, pagina * POR_PAG);
    $("tabela").innerHTML = fat.length
      ? fat
          .map(
            (r) =>
              "<tr><td><b>" +
              esc(r.nf) +
              "</b></td><td>" +
              esc(r.cliente) +
              "</td><td>" +
              esc(r.pedido || "-") +
              "</td><td>" +
              data(r.dataEmissao) +
              "</td><td>" +
              data(r.dataProgramada) +
              "</td><td>" +
              moeda.format(r.valor || 0) +
              "</td><td>" +
              numero.format(r.pesoBruto || 0) +
              " kg</td><td>" +
              esc((r.cidade || "-") + "/" + (r.uf || "-")) +
              "</td><td>" +
              esc(r.vendedor || "-") +
              "</td></tr>",
          )
          .join("")
      : '<tr><td colspan="9" class="empty">Nenhum resultado.</td></tr>';
    $("pagina").textContent = "Página " + pagina + " de " + max;
    $("anterior").disabled = pagina <= 1;
    $("proxima").disabled = pagina >= max;
  }
  function atualizar() {
    $("kTotal").textContent =
      resultados.length + erros.length + (window.__duplicados || 0);
    $("kValidos").textContent = resultados.length;
    $("kDuplicados").textContent = window.__duplicados || 0;
    $("kErros").textContent = erros.length;
    $("exportarCsv").disabled = !resultados.length;
    $("enviarTms").disabled = !resultados.length;
  }
  function progresso(p, t) {
    $("barra").style.width = p + "%";
    $("percentual").textContent = p + "%";
    estado(t);
  }
  function estado(t) {
    $("etapa").textContent = t;
    $("estadoMotor").textContent = t.length > 24 ? t.slice(0, 24) + "…" : t;
  }
  function bloquear(v) {
    $("analisar").disabled = v;
    $("cancelar").disabled = !v;
    $("limpar").disabled = v;
  }
  function csv() {
    const c = [
        "CHAVE_NFE",
        "NF",
        "SERIE",
        "DATA_EMISSAO",
        "DATA_SAIDA_ENTRADA",
        "DATA_PROGRAMADA",
        "HORA_SAIDA",
        "ORIGEM_DATA_PROGRAMADA",
        "CLIENTE",
        "CPF_CNPJ",
        "ENDERECO",
        "NUMERO",
        "COMPLEMENTO",
        "BAIRRO",
        "CIDADE",
        "UF",
        "CEP",
        "PEDIDO",
        "NUMERO_VENDA",
        "VENDEDOR",
        "VALOR",
        "PESO_BRUTO",
        "PESO_LIQUIDO",
        "VOLUMES",
        "TRANSPORTADORA",
        "ORIGEM_XML",
      ],
      linhas = [
        c.join(";"),
        ...resultados.map((r) =>
          c
            .map(
              (k) => '"' + String(r[camel(k)] ?? "").replace(/"/g, '""') + '"',
            )
            .join(";"),
        ),
      ];
    baixar(
      "\ufeff" + linhas.join("\r\n"),
      "TMS_XML_" + new Date().toISOString().slice(0, 10) + ".csv",
      "text/csv;charset=utf-8",
    );
  }
  function camel(k) {
    const m = {
      CHAVE_NFE: "chave",
      DATA_EMISSAO: "dataEmissao",
      DATA_SAIDA_ENTRADA: "dataSaidaEntrada",
      DATA_PROGRAMADA: "dataProgramada",
      HORA_SAIDA: "horaSaida",
      ORIGEM_DATA_PROGRAMADA: "origemDataProgramada",
      CPF_CNPJ: "cpfCnpj",
      NUMERO_VENDA: "numeroVenda",
      PESO_BRUTO: "pesoBruto",
      PESO_LIQUIDO: "pesoLiquido",
      ORIGEM_XML: "origemXml",
    };
    return m[k] || k.toLowerCase();
  }
  function enviar() {
    const id = "XML-" + Date.now(),
      lotes = [];
    const parametros = new URLSearchParams(window.location.search);
    const nonce = parametros.get("tmsNonce") || "";
    const retornoOrigin = parametros.get("retornoOrigin") || "";
    for (let i = 0; i < resultados.length; i += 50)
      lotes.push(resultados.slice(i, i + 50));
    sessionStorage.setItem(
      "tms_xml_importacao",
      JSON.stringify({ id, total: resultados.length, lotes: lotes.length }),
    );
    if (
      window.opener &&
      !window.opener.closed &&
      nonce &&
      /^https:\/\//i.test(retornoOrigin)
    ) {
      window.opener.postMessage(
        {
          tipo: "TMS_XML_PRONTO",
          id,
          total: resultados.length,
          lotes,
          nonce,
        },
        retornoOrigin,
      );
      alert(
        "Dados tratados enviados com segurança ao TMS em " +
          lotes.length +
          " lote(s). Volte à janela do sistema para conferir e confirmar.",
      );
    } else {
      baixar(
        JSON.stringify(
          { id, geradoEm: new Date().toISOString(), lotes },
          null,
          2,
        ),
        "TMS_XML_TRATADO.json",
        "application/json",
      );
      alert(
        "Arquivo tratado gerado. Para envio automático, abra este importador pelo botão dentro do TMS.",
      );
    }
  }
  function baixar(s, n, t) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([s], { type: t }));
    a.download = n;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function bytes(n) {
    return n < 1048576
      ? (n / 1024).toFixed(1) + " KB"
      : (n / 1048576).toFixed(1) + " MB";
  }
  function data(s) {
    if (!s) return "-";
    const d = new Date(s);
    return isNaN(d) ? esc(s) : d.toLocaleDateString("pt-BR");
  }
  function esc(s) {
    return String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
})();

