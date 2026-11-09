# YUCE PDF EDITOR — Mobile

[Türkçe](README.md) · [English](README.en.md) · **Português (Brasil)**

*YUCE PDF Düzenleyici*

Editor de PDF no estilo do Adobe Acrobat Pro para **Android** e **iOS / iPadOS**.
Usa o **mesmo motor de PDF** (MuPDF) e oferece os mesmos recursos da versão
para desktop [YUCE PDF EDITOR](https://github.com/bariscagriyuce/pdf-studio)
(Windows / Linux), com uma interface adaptada ao toque. Funciona totalmente
offline: nenhum dado sai do aparelho, e o aplicativo nem sequer pede permissão
de acesso à Internet.

| | |
|---|---|
| **Motor** | MuPDF (versão oficial em WebAssembly, mupdf.js) — o mesmo núcleo do PyMuPDF no desktop |
| **OCR** | Tesseract (tesseract.js), dados de idioma turco + inglês incluídos no aplicativo |
| **Interface** | Feita para toque, tema escuro/claro, layouts para celular e tablet; Türkçe, English, Português (Brasil) |
| **Plataforma** | Android 8.0+ · iOS / iPadOS 15+ |

> **Mudança de nome (1.1.0):** O aplicativo, antes chamado *PDF Studio*, agora
> se chama *YUCE PDF EDITOR* (*YUCE PDF Düzenleyici* em turco). O ID do pacote
> não mudou, então ele é instalado por cima da 1.0.0 e mantém suas
> configurações e arquivos recentes.

> **Idiomas da interface (1.2.0):** turco, inglês e português do Brasil.
> Por padrão é usado o idioma do aparelho; troque na hora em
> **Aparência → Idioma…** ou **Ferramentas → Configurações… → Idioma** (o
> documento aberto continua aberto). Os formatos de números e porcentagens e o
> nome do aplicativo seguem o idioma escolhido. No Android 13+, a escolha também
> é aplicada à configuração *Idioma do app* do sistema; no iOS, o idioma do
> aplicativo no sistema é escolhido em *Ajustes → YUCE PDF → Idioma*.

---

## Instalação

Na página [Releases](https://github.com/bariscagriyuce/pdf-studio-mobil/releases):

| Plataforma | Arquivo | Como instalar |
|---|---|---|
| **Android** | `YUCE-PDF-Editor-<versão>.apk` | Baixe no celular e abra (pode ser pedido para "permitir instalação de fontes desconhecidas") |
| **iOS / iPadOS** | `YUCE-PDF-Editor-<versão>-unsigned.ipa` | Assine com seu próprio Apple ID e instale usando o [AltStore](https://altstore.io) ou o [Sideloadly](https://sideloadly.io). Se você tem um Mac, pode instalar diretamente pelo Xcode (veja [`IOS/README.md`](IOS/README.md)). |

---

## Recursos

Tudo o que a versão para desktop faz:

- **Edição de texto** — toque em um bloco de texto na página; conteúdo, fonte,
  tamanho, cor, alinhamento e espaçamento entre linhas são editados em uma
  janela com **pré-visualização ao vivo**. O texto antigo é realmente removido
  (tarja) e o novo é gravado no conteúdo da página. Uma fonte Unicode é
  incorporada para os caracteres turcos (`ığşİĞŞ`).
- **Adicionar texto**, **localizar e substituir** (fonte e cor originais
  preservadas), **apagar área**.
- **Anotações** — realce, sublinhado, tachado, ondulado, nota adesiva, caixa de
  texto livre, desenho à mão livre com caneta, retângulo, elipse, linha, seta,
  polígono, carimbo, link, anexo de arquivo; cor, preenchimento, espessura,
  opacidade, autor; mova com o dedo e redimensione pelos cantos.
- **Gerenciamento de páginas** — inserir, excluir, duplicar, girar, reordenar
  arrastando as miniaturas, recortar, redimensionar, mesclar, dividir, extrair,
  adicionar imagens como páginas, inverter a ordem; marca d'água, números de
  página, cabeçalho/rodapé, marcadores.
- **Formulários** — preencher, adicionar campos (texto, caixa de seleção, lista,
  lista suspensa, campo de assinatura), exportar/importar JSON, nivelar.
- **Imagens** — inserir, mover/redimensionar, substituir, excluir, exportar.
- **Assinatura** — desenhe com o dedo/caneta, digite ou importe um PNG
  transparente; ela fica salva para reutilização.
- **Segurança** — criptografia AES-256/AES-128/RC4, permissões, remoção de
  senha, **tarja real**, limpeza de metadados e JavaScript.
- **Exportação** — imagens PNG/JPG/WEBP (36–1200 DPI), texto/HTML/XHTML/XML/JSON,
  páginas selecionadas, imagens incorporadas, redução de tamanho. Vários
  arquivos são salvos ou compartilhados como ZIP.
- **Imprimir área** — desenhe uma caixa na página e somente essa região é
  impressa: ajustar ao papel / tamanho real / escala personalizada,
  centralização, marcas de corte, impressão da mesma área em várias páginas
  (etiquetas, recibos, trechos de formulário); o papel fica na horizontal
  automaticamente em áreas largas. **Salvar como PDF** exporta a área em
  tamanho real e qualidade vetorial (o texto continua selecionável, anotações
  incluídas).
- **OCR** — adiciona uma camada de texto pesquisável a páginas digitalizadas
  (no aparelho, offline).
- **Visualização** — layouts contínuo / página única / duas páginas / duas
  páginas com capa, zoom de 8% a 1200% (com dois dedos), painéis (páginas,
  marcadores, anotações, busca, formulários, imagens), busca (incluindo a
  equivalência de maiúsculas/minúsculas do turco).
- **Integração com o celular** — seletor de arquivos do sistema, "Salvar"
  sobrescreve o arquivo original (iCloud, Google Drive…), arquivos recentes,
  PDFs recebidos por "Abrir com" / "Compartilhar", compartilhamento e impressão
  do sistema, botão Voltar do Android, atalhos de teclado em tablets (os mesmos
  do desktop).

---

## Estrutura do projeto

```
MOBIL_ORTAK/   Motor de PDF compartilhado e interface de toque (as duas plataformas o executam)
ANDROID/       Aplicativo Android — shell em Kotlin, Gradle
IOS/           Aplicativo iOS / iPadOS — shell em Swift, Xcode
.github/workflows/build.yml   Testes do motor + compilação de APK e IPA e publicação
```

Detalhes (em turco): [`MOBIL_ORTAK/README.md`](MOBIL_ORTAK/README.md) ·
[`ANDROID/README.md`](ANDROID/README.md) · [`IOS/README.md`](IOS/README.md)

## Compilando você mesmo

```bash
cd MOBIL_ORTAK && npm install && npm test
```

Android: `cd ANDROID && bash gradlew assembleRelease` (JDK 17+, Android SDK 35).
iOS: abra `IOS/PDFStudio.xcodeproj` no Xcode.

### Compilação automática e publicação de versões

- **Compilação manual:** *Actions* → *Mobil derleme* → *Run workflow*. Os
  resultados ficam guardados como artefatos por 90 dias.
- **Publicar uma versão:** `git tag v1.2.3 && git push --tags`. O número da
  versão é lido da tag (`MOBIL_ORTAK/scripts/set_version.mjs`), e o APK e o IPA
  são enviados permanentemente para a página *Releases* com somas SHA256.

Cada compilação passa primeiro pelos 66 testes do motor compartilhado e pela
verificação de traduções (traduções ausentes, marcadores incompatíveis).

### Traduções

O idioma de origem é o turco: o texto em turco no código também é a chave de
tradução (`MOBIL_ORTAK/web/js/i18n.js`, a mesma abordagem estilo gettext do
aplicativo para desktop). As traduções ficam em `MOBIL_ORTAK/web/js/locales/en.js`
e `pt_BR.js`. Depois de uma alteração, `npm test` aponta traduções ausentes;
`node test/i18n.test.mjs --missing ausentes.json` as lista em JSON.

## Licença

O código é de uso livre. Valem as licenças das dependências: MuPDF / mupdf.js
**AGPL-3.0** (distribuir o aplicativo como produto comercial de código fechado
exige uma licença comercial da Artifex), tesseract.js **Apache-2.0**, fontes
Liberation **OFL 1.1**, fontes DejaVu licença **Bitstream Vera**.

> **A tarja é irreversível:** depois de aplicada e com o documento salvo, o
> conteúdo é realmente apagado. Faça backup de documentos importantes.
