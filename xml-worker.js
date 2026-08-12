importScripts('./vendor/jszip.min.js');

let cancelado = false;

self.onmessage = async (evento) => {
  const msg = evento.data || {};
  if (msg.tipo === 'cancelar') { cancelado = true; return; }
  if (msg.tipo !== 'processar') return;
  cancelado = false;
  try {
    const registros = [], erros = [];
    if (/\.zip$/i.test(msg.nome)) {
      const zip = await JSZip.loadAsync(msg.buffer);
      const nomes = Object.keys(zip.files).filter(n => !zip.files[n].dir && /\.xml$/i.test(n));
      for (let i = 0; i < nomes.length && !cancelado; i++) {
        try { registros.push(parseNFe(await zip.files[nomes[i]].async('string'), nomes[i])); }
        catch (e) { erros.push({ arquivo: nomes[i], erro: e.message }); }
        if (i % 20 === 0) postMessage({ tipo: 'pulso', qtd: i + 1, total: nomes.length });
      }
    } else {
      registros.push(parseNFe(new TextDecoder('utf-8').decode(msg.buffer), msg.nome));
    }
    postMessage({ tipo: 'resultado', id: msg.id, registros, erros, cancelado });
  } catch (e) {
    postMessage({ tipo: 'resultado', id: msg.id, registros: [], erros: [{ arquivo: msg.nome, erro: e.message }], cancelado });
  }
};

function bloco(xml, tag) {
  const r = new RegExp('<(?:\\w+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?' + tag + '>', 'i').exec(xml);
  return r ? r[1] : '';
}
function texto(xml, tag) { return decodificar(bloco(xml, tag).replace(/<[^>]+>/g, '').trim()); }
function todos(xml, tag) {
  const itens = [], r = new RegExp('<(?:\\w+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?' + tag + '>', 'gi');
  let m; while ((m = r.exec(xml))) itens.push(decodificar(m[1].replace(/<[^>]+>/g, '').trim()));
  return itens;
}
function decodificar(s) {
  const mapa = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
  return String(s || '').replace(/&(amp|lt|gt|quot|apos);/g, x => mapa[x] || x).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
function numero(s) {
  s = String(s || '0').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s.replace(/[^\d.-]/g, '')) || 0;
}
function achar(s, regex) { const m = regex.exec(s || ''); return m ? m[1].trim() : ''; }
function somenteDataISO(valor) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(valor || '').trim());
  return m ? m[1] : '';
}
function horaISO(valor) {
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(String(valor || '').trim());
  return m ? m[1] : '';
}
function adicionarDiasISO(valor, dias) {
  const iso = somenteDataISO(valor);
  if (!iso) return '';
  const partes = iso.split('-').map(Number);
  const d = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
  d.setUTCDate(d.getUTCDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

function parseNFe(xml, nomeArquivo) {
  const inf = bloco(xml, 'infNFe');
  if (!inf) throw Error('Não é um XML NF-e autorizado.');
  const id = /<(?:\w+:)?infNFe[^>]*\bId=["']NFe(\d{44})["']/i.exec(xml);
  const ide = bloco(inf, 'ide'), dest = bloco(inf, 'dest'), endereco = bloco(dest, 'enderDest');
  const total = bloco(inf, 'ICMSTot'), transporta = bloco(inf, 'transporta'), vol = bloco(inf, 'vol');
  const infCpl = texto(inf, 'infCpl');
  const chave = id ? id[1] : ((xml.match(/\d{44}/) || [])[0] || '');
  if (!/^\d{44}$/.test(chave)) throw Error('Chave de acesso não encontrada.');
  const pedidos = todos(inf, 'xPed').filter(Boolean);
  const pedido = pedidos[0] || achar(infCpl, /N\s*Ped\.\s*(?:Venda)?\s*:\s*([\w./-]+)/i);
  const dataEmissao = texto(ide, 'dhEmi') || texto(ide, 'dEmi');
  const dataSaidaEntrada = texto(ide, 'dhSaiEnt') || texto(ide, 'dSaiEnt');
  const dataProgramada = somenteDataISO(dataSaidaEntrada) || adicionarDiasISO(dataEmissao, 1);
  return {
    chave, nf: texto(ide, 'nNF'), serie: texto(ide, 'serie'),
    dataEmissao,
    dataSaidaEntrada,
    dataProgramada,
    horaSaida: horaISO(dataSaidaEntrada),
    origemDataProgramada: dataSaidaEntrada ? 'XML_SAIDA_ENTRADA' : 'EMISSAO_MAIS_1_DIA',
    cliente: texto(dest, 'xNome'), cpfCnpj: texto(dest, 'CNPJ') || texto(dest, 'CPF'),
    endereco: texto(endereco, 'xLgr'), numero: texto(endereco, 'nro'), complemento: texto(endereco, 'xCpl'),
    bairro: texto(endereco, 'xBairro'), cidade: texto(endereco, 'xMun'), uf: texto(endereco, 'UF'), cep: texto(endereco, 'CEP'),
    pedido,
    numeroVenda: achar(infCpl, /N\s*Venda\s*:\s*([\w./-]+)/i),
    vendedor: achar(infCpl, /Vendedor\s*:\s*(.*?)(?=\s+Transportador\s*:|\s+Frete\s+por\s+Conta\s*:|$)/i),
    valor: numero(texto(total, 'vNF')), pesoBruto: numero(texto(vol, 'pesoB')),
    pesoLiquido: numero(texto(vol, 'pesoL')), volumes: numero(texto(vol, 'qVol')),
    transportadora: texto(transporta, 'xNome'), origemXml: nomeArquivo
  };
}

