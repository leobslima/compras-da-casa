# Compras da Casa

Aplicativo para acompanhar as compras de mercado de duas pessoas (você e a Viviane), com histórico de preços, relatórios e backup.

**Status honesto:** o app está construído e as regras principais têm testes automatizados passando no computador (57 testes). **Ainda não foi testado no navegador do celular, não está publicado em endereço da internet, e a sincronização com o Google Drive depende de uma configuração sua que ainda não foi feita.** Nada disso deve ser considerado pronto até ser testado no seu aparelho.

## Versão para usar no celular, sem nuvem (recomendada)

O arquivo **`dist/Compras-da-Casa.html`** contém o app inteiro: não precisa de servidor, internet, conta Google nem pagamento. Os dados ficam salvos no navegador do próprio celular.

Para gerar o arquivo de novo depois de alterar o código: `node build/gerar-local.mjs`.

**Como colocar no celular (sem usar nuvem):**
1. Ligue o celular ao computador com um cabo USB e escolha "Transferir arquivos".
2. Copie `Compras-da-Casa.html` para a pasta Downloads do celular.
3. No celular, abra o arquivo pelo app Arquivos (ou Meus Arquivos) e escolha abrir com o Chrome.

**Dois celulares, sem nuvem:** cada celular tem seus próprios dados. Para levar as compras de um ao outro, use **Configurações > Baixar backup (JSON)** no celular de origem e **Configurações > Importar backup** no outro, escolhendo **Mesclar**. A mesclagem só acrescenta o que é novo, então nada é apagado.

**Cuidados:**
- Se você limpar os dados do Chrome, os registros deste celular são perdidos. Faça backup de vez em quando.
- O Chrome pode não permitir instalar o arquivo na tela inicial; use o navegador para abri-lo.
- Esta versão foi verificada no computador com um simulador do navegador; ainda não foi testada no celular real.

## 1. Arquitetura

**Formato:** um PWA (site instalável na tela inicial do Android), em HTML, CSS e JavaScript puro, sem frameworks e sem servidor próprio.

**Armazenamento local:** cada celular guarda seus dados no IndexedDB, o banco embutido do navegador. Os dados continuam salvos ao fechar o navegador.

**Funciona sem internet:** o service worker (`sw.js`) guarda a parte visual do app. Os dados das compras ficam no celular, então registrar compras não depende de internet.

**Compartilhamento:** a pasta `Compras da Casa` no Google Drive, com um arquivo por pessoa:
- `compras-eu.json`: gravado pelo celular que está configurado como "Eu"
- `compras-viviane.json`: gravado pelo celular configurado como "Viviane"

Cada celular grava somente o próprio arquivo e lê o do outro. Ao juntar os dados, cada registro tem um identificador único e uma data de alteração. Se o mesmo registro foi alterado nos dois celulares, fica a alteração mais recente, e o app informa quantos conflitos foram resolvidos assim.

**Por que não um arquivo único:** dois celulares escrevendo o mesmo arquivo causam perda silenciosa de dados.

**Quando sincroniza:** quando você toca em "Sincronizar agora" em Configurações, com internet. Um app web não sincroniza sozinho em segundo plano.

## 2. Escopo dos dados

- **Produto:** nome, categoria e status (ativo ou inativo). Não há marca, tamanho de embalagem nem unidade de medida.
- **Item comprado:** quantidade de itens (inteiro, por exemplo 1 café), preço unitário e subtotal (quantidade × preço unitário).
- **Compra:** data, horário, quem comprou, estabelecimento e total.

**Embalagens diferentes são produtos diferentes.** Cadastre cada tamanho com o nome refletindo a embalagem (por exemplo, "Café 500 g" e "Café 1 kg"), para que o histórico de preços fique separado.

**Editar e excluir:** você pode editar o nome e a categoria de um produto sem perder o histórico, porque o histórico usa o identificador do produto. Desativar um produto só o tira da lista de novas compras; ele continua nos históricos e relatórios.

**Corrigir compra já finalizada:** é possível, mas exige um motivo. A correção guarda o estado anterior (itens, estabelecimento, quem comprou e total) e recalcula o total. Nenhuma correção apaga as anteriores.

## 3. Telas

- **Início:** indicadores do mês (total, compras, média, variação em relação ao mês anterior, produtos que ficaram mais caros e mais baratos), gráfico de participação das categorias e gastos por dia. Aviso se houver compra em andamento.
- **Produtos:** pesquisar, adicionar (com alerta de nome parecido), editar, ativar e desativar, e renomear categorias.
- **Preparar:** escolher produtos e quantidades para a próxima ida ao mercado, e gerar a lista.
- **Compra:** iniciar a partir de uma lista, registrar quantidade e preço de cada item, marcar situação (comprado, não encontrado, não comprado), adicionar produtos extras, ver o último preço pago, finalizar com confirmação ou descartar. Compras interrompidas são retomadas ao reabrir o app.
- **Histórico:** compras finalizadas com filtros combináveis (período, mercado, quem comprou, produto), detalhe de cada compra, correção com registro e histórico de preço por produto.
- **Relatórios:** atalhos de período, filtros combináveis, total, média, comparação com o período anterior, gastos por categoria, mercado e produto, e maiores aumentos e reduções de preço, com ordenação.
- **Configurações:** quem usa este celular, sincronização com o Google Drive, backup em JSON, compras em CSV, importação de backup (com mesclagem ou substituição com confirmação).

## 4. O que você precisa fazer para ativar a sincronização

A sincronização não funciona até você concluir estes passos. Eu não consigo criar essas credenciais por você.

1. Acesse o Google Cloud Console (console.cloud.google.com) com sua conta Google e crie um projeto gratuito.
2. Ative a **Google Drive API** nesse projeto.
3. Configure a **tela de consentimento OAuth** (tipo "Externo", com seu e-mail como usuário de teste).
4. Crie uma credencial do tipo **ID do cliente OAuth para aplicativo da Web**. Em "Origens JavaScript autorizadas", inclua o endereço onde o app for publicado.
5. Copie o ID do cliente gerado e cole em `src/config.js`, na constante `GOOGLE_CLIENT_ID`.
6. Adicione a conta da Viviane como usuária de teste na tela de consentimento, para que ela também consiga autorizar.

Depois disso, em cada celular: abra Configurações, escolha "Este celular é de" (Eu ou Viviane), toque em "Conectar ao Google Drive" e depois em "Sincronizar agora".

**Atenção:** o código de sincronização foi escrito, mas **não foi testado contra o Google Drive real**. Teste com dados de exemplo antes de confiar nele.

## 5. Como publicar e instalar no celular

O app precisa estar em um endereço de internet com HTTPS (por exemplo, um serviço de páginas estáticas gratuito). Ainda não foi publicado. Quando publicar:
1. Abra o endereço no navegador do celular (Chrome).
2. Toque no menu e em "Adicionar à tela inicial" ou "Instalar app".
3. Repita a instalação no celular da Viviane.

Cada celular terá seus próprios dados locais. Para unir tudo, use a sincronização com o Drive ou a importação de backup.

## 6. Custos e limites

- **Google Drive:** gratuito para uso doméstico, usando a cota da sua conta Google (15 GB, compartilhados com Gmail e Fotos).
- **Google Cloud (Drive API):** gratuito dentro dos limites normais de um app pessoal.
- **Hospedagem do PWA:** pode ser gratuita em um serviço de páginas estáticas. Ainda não foi escolhida.

## 7. Backup e restauração

1. **Backup:** em Configurações, toque em "Baixar backup (JSON)" e guarde o arquivo no Google Drive.
2. **Restaurar:** em Configurações, em "Importar backup", escolha o arquivo. Antes de qualquer mudança, o app mostra o que vai acontecer.
   - **Mesclar** adiciona só o que é novo e não altera nem apaga nada que já existe.
   - **Substituir tudo** só acontece se você digitar SUBSTITUIR, e apaga os dados deste celular.
3. **Planilha:** em Configurações, "Baixar compras (CSV)" gera um arquivo para o Excel ou o Planilhas Google.

## 8. Produtos iniciais

Arquivo: `dados/produtos-iniciais.json`. São 55 produtos em 6 categorias, conforme a lista confirmada. A especificação menciona 63; os 8 que faltam não foram inventados. Quando você enviar a lista completa, eles entram no mesmo arquivo.

## 9. Testes

Execute `npm test` no computador. São 57 testes das regras de negócio: validações, subtotais e totais, último preço pago, variação percentual, filtros do histórico, relatórios, backup e CSV, correção com registro, edição de produtos, mesclagem de sincronização, ordenação e geometria dos gráficos.

**Ainda não testado:**
- Interface no navegador do celular real (o IndexedDB e o service worker só funcionam no navegador).
- Sincronização com o Google Drive real.
- Instalação na tela inicial e funcionamento sem internet.
- Preço por embalagem diferente e a navegação completa com uma mão.

## 10. Pendências conhecidas

- Os gráficos são simples (SVG gerado no código), sem biblioteca de gráficos.
- Não há tela de histórico de preço em gráfico de linha por produto, apenas a lista com variação.
- A publicação em endereço da internet ainda não foi feita.
