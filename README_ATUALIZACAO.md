# Scanner TMS Mobile v1.7.2

Atualização de desempenho do scanner externo publicado no GitHub Pages.

## O que mudou

- Prioridade para o `BarcodeDetector` nativo do Chrome Android.
- Fallback automático para ZXing nos aparelhos incompatíveis.
- ZXing limitado a `CODE_128` e `QR_CODE`, evitando processamento desnecessário.
- Câmera traseira solicitada diretamente antes da enumeração dos dispositivos.
- Resolução operacional reduzida para 960 x 540 e até 30 FPS.
- Solicitação de foco contínuo quando suportado pelo aparelho.
- Lanterna controlada diretamente pela faixa de vídeo.
- Retorno ao TMS reduzido de 520 ms para 120 ms.
- Leitura manual, fotografia, validação da chave de 44 dígitos e troca de câmera preservadas.

## Publicação no GitHub

No repositório `Daianrj/tms-scanner`:

1. Substitua o `index.html` pelo arquivo desta pasta.
2. Mantenha a pasta `vendor` exatamente como está.
3. Faça o commit.
4. Aguarde o GitHub Pages concluir a publicação.
5. Abra `https://daianrj.github.io/tms-scanner/?v=172` no celular para evitar cache antigo.

O endereço configurado no Apps Script continua válido e não precisa ser modificado.

## Validação

- JavaScript verificado sintaticamente.
- Elementos obrigatórios da interface conferidos.
- Fallback preservado para navegadores sem `BarcodeDetector`.
- O teste final de câmera e foco precisa ser feito em aparelho físico, pois depende do hardware e do navegador.
