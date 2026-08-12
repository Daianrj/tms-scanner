# Importador XML NF-e TMS v1.9.1

Motor estático para processar XMLs e ZIPs localmente com Web Workers e IndexedDB.

## Privacidade

Os XMLs não são enviados ao GitHub. O navegador lê os arquivos no aparelho do operador e guarda somente a fila temporária no IndexedDB da origem `github.io`.

## Publicação

Envie todos os arquivos para a raiz do repositório `tms-scanner`, mantendo a pasta `vendor`. A tela ficará disponível em `/importador.html`.

O `index.html` atual do scanner não deve ser apagado: este pacote acrescenta o importador ao mesmo GitHub Pages.

## Campos validados

- chave de acesso, número e série da NF-e;
- data e hora de emissão;
- data/hora de saída ou entrada (`dhSaiEnt`/`dSaiEnt`);
- data programada calculada pela saída/entrada do XML; quando ausente, emissão + 1 dia;
- razão social e CNPJ/CPF do destinatário;
- logradouro, número, complemento, bairro, cidade, UF e CEP;
- número do pedido, número da venda e vendedor;
- valor da nota em reais;
- peso bruto, peso líquido e volumes;
- transportadora e nome do XML de origem.

## Regra da data operacional

A emissão permanece como dado fiscal. A programação de entrega usa a data de saída/entrada informada pela NF-e. O fallback de emissão + 1 dia só é aplicado quando o XML não contém `dhSaiEnt` nem `dSaiEnt`.

## Capacidade testada

O motor foi validado com quatro modelos reais de NF-e e com uma carga sintética de 700 XMLs compactados em ZIP. O processamento acontece fora da interface, por Web Worker, e a prévia fica recuperável no IndexedDB do navegador.

## Integração automática com o TMS

Abra o importador pelo botão **Abrir importador rápido do GitHub** dentro da tela de Importação diária do TMS. Depois de analisar os XMLs, use **Preparar para o TMS**.

O navegador devolve os dados normalizados em lotes de 50 para a janela autorizada do Apps Script. O TMS confere duplicidades e reenvios antes de gravar, exige sessão ADM e salva um checkpoint a cada lote confirmado. Se esta página for aberta diretamente, o botão gera um JSON tratado para uso manual.

Desenvolvido por Daian — Daian.operacional@gmail.com
