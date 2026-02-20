import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- CONFIGURAÇÕES E CONSTANTES ---
const DEPOSITOS: Record<string, string> = {
  "14887582360": "LOJA",
  "6432743977": "SITE",
  "14887265613": "FULL"
};

// IDs que NÃO são Venda (Remessas, Devoluções de Compra, etc)
const IDS_NATUREZA_BLOQUEADA = [
  7255067378, 7314982489, 7256147975, 6432743917, // PortFio
  15108547530, 15108547532                        // Casa Modelo
];

// IDs de Devolução (Entrada na tabela 'devolucoes')
const IDS_NATUREZA_DEVOLUCAO = [
  7255067378, 7314982489, 7256147975, 
  15108547531, 15108547533,
  15108451958, 15105899604, 15104895197,
  15108451958, 15106005559,
  15104888811, 15104888810,
  15104888812, 15105145131,
  15104888813, 15104888814,
  15107012796, 6937065086,
  15103347853, 7255067378,
  7314982489, 7256147975                  
];

const IDS_NATUREZA_IGNORAR_COMPRA = [
  15107012796, 6937065086, 15103347853, // PortFio ROM/Outros
  15105899604, 15104895197, 15108451958, // PortCasa ROM
  15106005559, 15105145131
];

const BLACKLIST_FORNECEDORES = [
    "COM DE FIOS E TECIDOS PORTFIO", "COMERCIO DE FIOS E TECIDOS PORTFIO LTDA",
    "PORTCASA ON LINE LTDA", "MULTIART COMERCIO IMPORTACAO LTDA",
    "MBF INDUSTRIA DE TECIDOS E CONFECCOES LTDA EPP", "MC IND E CONFECCOES LTDA EPP",
    "MGM ARTIGOS PARA DECORACAO LTDA", "GR2M CONFECCAO E COMERCIO LTDA",
    "INDUSTRIA DE TAPETES LANCER S/A", "INDUSTRIA DE PLASTICOS MF LTDA",
    "LIN RAN VARIEDADES DOMESTICAS", "LIMA & LIMA COMÉRCIO DE TAPETES - LTDA",
    "LE PRESENTES LTDA", "KEITA INDUSTRIA E COMERCIO LTDA",
    "INDUSTRIA E COMERCIO ASHI II LTDA", "PEDROSA FABRICAÇÃO DE ARTEFATOS TÊXTEIS LTDA",
    "PRATA TEXTIL COM E MANUF DE TAPETES LTDA", "PRATATEXTIL COMERCIO E MANUFATURAS DE TAPETES LTDA",
    "EBAZAR.COM.BR LTDA", "SONO E CONFORTO COMERCIO LTDA"
];

const ID_LOJA_PORTFIO_SITE = 204457689; 
const ID_SIT_FULL = 375989;
const ID_SIT_ATENDIDO = 9;
const IDS_NFE_IGNORAR = [1, 2, 4, 8, 9, 10]; // 1 = Pendente (Padrão ignorar)

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const nomeLoja = url.searchParams.get('loja')?.toUpperCase()
    if (!nomeLoja) return new Response("Loja ausente", { status: 400 });

    const body = await req.json();
    const idBling = body.data?.produto?.id || body.data?.id;
    const event = body.event;

    console.log(`📥 [${nomeLoja}] Evento: ${event} | ID: ${idBling}`);

    if (!idBling || !event) { return new Response("OK", { status: 200 }); }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // --- REFRESH TOKEN ---
    const { data: integracao } = await supabase.from('integracoes_bling').select('*').eq('nome_loja', nomeLoja).single();
    let token = integracao.access_token;
    if (new Date(integracao.expires_at) < new Date(Date.now() + 5 * 60000)) {
       const auth = btoa(`${Deno.env.get(`BLING_CLIENT_ID_${nomeLoja}`)}:${Deno.env.get(`BLING_SECRET_${nomeLoja}`)}`);
       const r = await fetch(`https://www.bling.com.br/Api/v3/oauth/token`, { 
          method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, 
          body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: integracao.refresh_token }) 
       }).then(res => res.json());
       token = r.access_token;
       await supabase.from('integracoes_bling').update({ access_token: token, refresh_token: r.refresh_token, expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString() }).eq('nome_loja', nomeLoja);
    }

    const atualizarEstoqueManual = async (sku: string) => {
      const resEst = await fetch(`https://www.bling.com.br/Api/v3/estoques/saldos?skus[]=${sku}`, { headers: { "Authorization": `Bearer ${token}` } });
      if (resEst.ok) {
        const { data: saldos } = await resEst.json();
        for (const s of saldos) {
          for (const dep of s.depositos) {
            const canal = DEPOSITOS[String(dep.id)];
            if (canal) await supabase.from('estoque').upsert({ sku: sku, canal: canal, quantidade: dep.saldoFisico, updated_at: new Date().toISOString() }, { onConflict: 'sku,canal' });
          }
        }
      }
    };

    // FUNÇÃO AUXILIAR: Garante que a categoria exista antes de salvar o produto
    const garantirCategoria = async (idCategoria) => {
        if (!idCategoria || idCategoria === 0) return;

        // 1. Verifica se já existe no Supabase (Cache rápido de leitura)
        const { data: existe } = await supabase.from('categorias').select('id').eq('id', idCategoria).single();
        if (existe) return;

        console.log(`⚠️ Categoria ${idCategoria} nova detectada. Buscando no Bling...`);

        // 2. Busca no Bling
        const resBling = await fetch(`https://www.bling.com.br/Api/v3/categorias/produtos/${idCategoria}`, { 
            headers: { "Authorization": `Bearer ${token}` } 
        });

        if (resBling.ok) {
            const json = await resBling.json();
            const cat = json.data;

            // 3. Recursividade: Garante o Pai da categoria antes (se houver)
            if (cat.categoriaPai && cat.categoriaPai.id) {
                await garantirCategoria(cat.categoriaPai.id);
            }

            // 4. Salva a Categoria
            await supabase.from('categorias').upsert({
                id: cat.id,
                descricao: cat.descricao,
                id_categoria_pai: cat.categoriaPai?.id || null
            });
            console.log(`✅ Categoria ${cat.descricao} cadastrada.`);
        }
    };

    // --- ROTEAMENTO ---

    // A) ESTOQUE
    if (event.includes('stock.')) {
      const depInfo = body.data?.deposito;
      const canal = DEPOSITOS[String(depInfo?.id)];
      if (canal) {
        const colId = `id_bling_${nomeLoja.toLowerCase().replace('_', '')}`;
        const { data: prod } = await supabase.from('produtos').select('sku,tipo').eq(colId, idBling).single();
        if (prod && prod.tipo !== 'E') {
          await supabase.from('estoque').upsert({ sku: prod.sku, canal: canal, quantidade: depInfo.saldoFisico, updated_at: new Date().toISOString() }, { onConflict: 'sku,canal' });
        }
      }
    }

    // B) PEDIDOS DE VENDA
    else if (event.includes('order.') || event.includes('sales.')) {
      const resp = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas/${idBling}`, { headers: { "Authorization": `Bearer ${token}` } });
      if (resp.ok) {
        const { data: v } = await resp.json();
        let origem = (nomeLoja === 'PORTFIO' && v.situacao?.id === ID_SIT_FULL) ? "SITE_FULL" : 
                     (nomeLoja === 'PORTCASA' && v.situacao?.id === ID_SIT_ATENDIDO) ? "LOJA" : null;

        if (origem) {
          const itens = v.itens || [];
          
          // 1. Calcula o Desconto Global em REAIS (Tratando PERCENTUAL ou REAL)
          let valorDescontoGlobalDinheiro = 0;
          if (v.desconto?.unidade === 'PERCENTUAL') {
            valorDescontoGlobalDinheiro = (Number(v.totalProdutos || 0) * Number(v.desconto?.valor || 0)) / 100;
          } else {
            valorDescontoGlobalDinheiro = Number(v.desconto?.valor || 0);
          }

          let totalVendaBaseRateio = itens.reduce((acc, i) => acc + (i.valor * i.quantidade), 0) || 1;
          
          for (const item of itens) {
            if (IDS_NATUREZA_BLOQUEADA.includes(item.naturezaOperacao?.id)) continue;
            
            const peso = (item.valor * item.quantidade) / totalVendaBaseRateio;
            
            // 2. No V3, item.valor JÁ ESTÁ com o desconto de item aplicado.
            // Só precisamos ratear o desconto GLOBAL e o FRETE.
            const descGlobalRateadoLinha = valorDescontoGlobalDinheiro * peso;
            const freteRateadoLinha = (v.transporte?.frete || 0) * peso;
            
            const valorBrutoLinha = item.valor * item.quantidade;
            const valorLiquidoFinal = Math.max(0, valorBrutoLinha - descGlobalRateadoLinha + freteRateadoLinha);

            await supabase.from('pedidos_venda').upsert({
              id: idBling, sku: item.codigo, data_pedido: v.data, origem: origem, loja: nomeLoja,
              quantidade: item.quantidade, preco_unitario: item.valor, 
              desconto: descGlobalRateadoLinha + (item.desconto || 0), // Guardamos o total para fins de log
              frete: freteRateadoLinha,
              valor_total_liquido: valorLiquidoFinal 
            });
            await atualizarEstoqueManual(item.codigo);
          }
        } else {
          await supabase.from('pedidos_venda').delete().eq('id', idBling);
        }
      }
    }

    // C) NOTAS FISCAIS (VENDAS E DEVOLUÇÕES)
    else if (event.includes('invoice.') || event.includes('nfe.')) {
      const resp = await fetch(`https://www.bling.com.br/Api/v3/nfe/${idBling}`, { headers: { "Authorization": `Bearer ${token}` } });
      if (resp.ok) {
        const { data: nf } = await resp.json();
        const natId = nf.naturezaOperacao?.id;
        const eSerie1 = nf.serie === null || String(nf.serie) === "1";
        
        // Validação Padrão (Ignora Pendente, Cancelada, etc)
        const eSituacaoValidaPadrao = !IDS_NFE_IGNORAR.includes(nf.situacao);

        // --- ROTA 1: VENDA (Saída Tipo 1) ---
        if (nf.tipo === 1 && eSerie1 && eSituacaoValidaPadrao && !IDS_NATUREZA_BLOQUEADA.includes(natId)) {
          const itens = nf.itens || [];
          
          // 1. Calculamos o valor bruto total dos produtos na nota
          let totalBrutoProdutos = itens.reduce((acc, i) => {
             const preco = i.valor || i.valorUnitario || 0;
             return acc + (preco * i.quantidade);
          }, 0) || 1; 

          const vFrete = nf.valorFrete || 0;
          const vOutras = nf.outrasDespesas || 0;
          const vNota = nf.valorNota || 0;
          
          // 2. O Desconto Global da NFe é a diferença entre o (Bruto + Frete) e o Valor Final da Nota
          const valorDescontoTotalNota = Math.max(0, (totalBrutoProdutos + vFrete + vOutras) - vNota);

          for (const item of itens) {
            const precoTabelaUnitario = item.valor || item.valorUnitario || 0;
            const valorBrutoLinha = precoTabelaUnitario * item.quantidade;
            
            // 3. Calculamos o peso desta linha no faturamento total bruto
            const peso = valorBrutoLinha / totalBrutoProdutos;
            
            // 4. Rateamos o desconto e o frete proporcionalmente
            const descontoLinhaRateado = valorDescontoTotalNota * peso;
            const freteLinhaRateado = vFrete * peso;
            
            // 5. Valor Líquido Real da Linha (O que o cliente pagou por esses itens)
            const valorLiquidoRealLinha = Math.max(0, valorBrutoLinha - descontoLinhaRateado + freteLinhaRateado);

            await supabase.from('nfe_saida').upsert({
              id: idBling, 
              sku: item.codigo, 
              data_emissao: nf.dataEmissao.substring(0, 10),
              origem: nomeLoja === 'CASA_MODELO' ? 'CASA_MODELO' : 'SITE', 
              loja: nomeLoja, 
              quantidade: item.quantidade, 
              preco_unitario: precoTabelaUnitario, 
              desconto: descontoLinhaRateado, // Salvamos o desconto total da linha
              frete: freteLinhaRateado,
              valor_total_liquido: valorLiquidoRealLinha // Valor pronto para o Dashboard
            });
          }
          console.log(`✅ NFe Venda ${idBling} recalculada e salva.`);
        }
        
        // --- ROTA 2: DEVOLUÇÃO (Entrada Tipo 0) ---
        else if (nf.tipo === 0 && IDS_NATUREZA_DEVOLUCAO.includes(natId)) {
          
          let origemDevolucao = null;

          // REGRA PORTCASA: Série 888 + Pendente (Situação 1)
          if (nomeLoja === 'PORTCASA') {
            const eSerie888 = String(nf.serie) === "888";
            const ePendente = nf.situacao === 1; 
            if (eSerie888 && ePendente) origemDevolucao = "LOJA";
          } 
          // REGRA PADRÃO (PortFio / Casa Modelo): Situação Válida + Regras de Loja
          else if (eSituacaoValidaPadrao) {
            if (nomeLoja === 'PORTFIO') {
               if (nf.loja?.id === ID_LOJA_PORTFIO_SITE) origemDevolucao = "SITE";
            } 
            else if (nomeLoja === 'CASA_MODELO') {
               origemDevolucao = "CASA_MODELO";
            }
          }

          if (origemDevolucao) {
            const itens = nf.itens || [];
            
            const vFrete = nf.valorFrete || 0;
            const vOutras = nf.outrasDespesas || 0;
            const vNota = nf.valorNota || 0;

            // 1. Calcula soma bruta dos produtos na nota
            let totalBrutoProdutos = itens.reduce((acc, i) => {
               const preco = i.valor || i.valorUnitario || 0;
               return acc + (preco * i.quantidade);
            }, 0) || 1;

            // 2. Calcula o Desconto Total da Nota (Gap fiscal)
            const valorDescontoTotalNota = Math.max(0, (totalBrutoProdutos + vFrete + vOutras) - vNota);

            for (const item of itens) {
              const precoTabelaUnitario = item.valor || item.valorUnitario || 0;
              const valorBrutoLinha = precoTabelaUnitario * item.quantidade;

              // 3. Rateio proporcional (Peso)
              const peso = valorBrutoLinha / totalBrutoProdutos;
              
              // 4. Rateia Desconto, Frete e Outras Despesas
              const descRateio = valorDescontoTotalNota * peso;
              const freteRateio = vFrete * peso;
              const outrasRateio = vOutras * peso;

              // 5. Valor Líquido do Estorno (O que de fato saiu do caixa/receita)
              // Soma o bruto + frete + taxas e subtrai o desconto
              const valorEstornoLiquido = Math.max(0, (valorBrutoLinha + freteRateio + outrasRateio) - descRateio);

              await supabase.from('devolucoes').upsert({
                id: idBling, 
                sku: item.codigo, 
                data_devolucao: nf.dataEmissao.substring(0, 10),
                origem: origemDevolucao, 
                loja: nomeLoja, 
                quantidade: item.quantidade, 
                valor_estorno: valorEstornoLiquido
              });
            }
            console.log(`✅ Devolução ${idBling} recalculada e salva.`);
          } else {
            await supabase.from('devolucoes').delete().eq('id', idBling);
          }
        }
        // --- ROTA 3: COMPRA (Entrada Tipo 0) ---
        else if (nf.tipo === 0 && !IDS_NATUREZA_DEVOLUCAO.includes(natId)) {
            const nomeFornecedor = nf.contato?.nome?.toUpperCase() || "";
            const ehFornecedorBloqueado = BLACKLIST_FORNECEDORES.some(f => nomeFornecedor.includes(f.toUpperCase()));
            const ehNaturezaBloqueada = IDS_NATUREZA_IGNORAR_COMPRA.includes(natId);
            const ehLojaCompraValida = nf.loja?.id === 0; 

            if (!ehFornecedorBloqueado && !ehNaturezaBloqueada && ehLojaCompraValida && eSituacaoValidaPadrao) {
                const itens = nf.itens || [];
                
                // Valores para Rateio
                const valFreteTotal = nf.valorFrete || 0;
                const valOutrasTotal = nf.outrasDespesas || 0;
                const totalRateioHeader = valFreteTotal + valOutrasTotal;

                let somaProdutos = itens.reduce((acc, i) => acc + ((i.valor || 0) * i.quantidade), 0);
                if (somaProdutos === 0) somaProdutos = 1;

                for (const item of itens) {
                    if (!item.codigo || item.codigo.trim() === "") continue;

                    const qtd = item.quantidade;
                    const valorBrutoUnit = item.valor || item.valorUnitario || 0;
                    const pesoItem = (valorBrutoUnit * qtd) / somaProdutos;

                    // Cálculo de componentes
                    const freteRateadoUnit = (totalRateioHeader * pesoItem) / qtd;
                    const ipiUnit = (item.impostos?.ipi?.valor || 0) / qtd;
                    const descUnit = item.desconto || 0;

                    await supabase.from('entradas_compras').upsert({
                        id_bling: idBling,
                        sku: item.codigo,
                        data_entrada: nf.dataEmissao.substring(0, 10),
                        quantidade: qtd,
                        custo_unitario: valorBrutoUnit,
                        desconto: descUnit,
                        frete: freteRateadoUnit,
                        ipi: ipiUnit,
                        nfe: String(nf.numero),
                        fornecedor: nf.contato?.nome,
                        loja: nomeLoja
                    }, { onConflict: 'id_bling,sku' });
                }
                console.log(`✅ Compra ${nf.numero} calculada e processada.`);
            } else {
                await supabase.from('entradas_compras').delete().eq('id_bling', idBling);
            }
        }
        else {
          // Limpeza geral (Canceladas, Denegadas, etc em qualquer tipo de nota)
          await supabase.from('nfe_saida').delete().eq('id', idBling);
          await supabase.from('devolucoes').delete().eq('id', idBling);
          await supabase.from('entradas_compras').delete().eq('id_bling', idBling); // Adicionado para compras
        }
      }
    }

    // D) PRODUTOS E COMPOSIÇÕES
    else if (event.includes('product.')) {
      const respBling = await fetch(`https://www.bling.com.br/Api/v3/produtos/${idBling}`, { 
        headers: { "Authorization": `Bearer ${token}` } 
      });

      if (respBling.ok) {
        const { data: p } = await respBling.json();
        const skuPrincipal = p.codigo;
        const colIdLoja = `id_bling_${nomeLoja.toLowerCase().replace('_', '')}`;

        // --- CORREÇÃO: GARANTIR CATEGORIA DO PAI ---
        if (p.categoria && p.categoria.id) {
            await garantirCategoria(p.categoria.id);
        }

        // 1. Salva o Produto Principal
        const dadosPrincipais = {
          sku: skuPrincipal, 
          nome: p.nome, 
          custo_fixo: p.fornecedor?.precoCusto || 0, 
          preco_venda_padrao: p.preco, 
          tipo: p.tipo || 'P', 
          situacao: p.situacao || 'A',
          formato: p.formato || 'S', 
          gtin: p.gtin || null, 
          gtin_embalagem: p.gtinEmbalagem || null, // Mapeando gtinEmbalagem do JSON
          fornecedor: p.fornecedor?.contato?.nome || null,
          categoria_id: p.categoria?.id || null, 
          [colIdLoja]: idBling 
        };

        const { error: errPai } = await supabase.from('produtos').upsert(dadosPrincipais, { onConflict: 'sku' });
        if (errPai) console.error(`❌ Erro ao salvar Pai ${skuPrincipal}:`, errPai.message);
        else console.log(`✅ Produto ${skuPrincipal} atualizado.`);

        // 2. Processar Variações (Se existirem)
        if (p.variacoes && p.variacoes.length > 0) {
            console.log(`🔄 Processando ${p.variacoes.length} variações de ${skuPrincipal}...`);
            
            for (const v of p.variacoes) {
                try {
                    // --- ATUALIZAÇÃO AQUI: GARANTIR CATEGORIA DA VARIAÇÃO ---
                    // Se a variação tiver uma categoria explicita, garantimos que ela existe antes de salvar
                    if (v.categoria && v.categoria.id) {
                        await garantirCategoria(v.categoria.id);
                    }

                    const custoFilho = v.fornecedor?.precoCusto || p.fornecedor?.precoCusto || 0;
                    const precoFilho = v.preco || 0;

                    await supabase.from('produtos').upsert({
                        sku: v.codigo,
                        nome: v.nome,
                        custo_fixo: custoFilho,
                        preco_venda_padrao: precoFilho, 
                        tipo: v.tipo || 'P', // Default P
                        situacao: v.situacao || 'A', // Default A
                        formato: v.formato || 'S', // Default S
                        gtin: v.gtin || null,
                        gtin_embalagem: v.gtinEmbalagem || null,
                        fornecedor: v.fornecedor?.contato?.nome || p.fornecedor?.contato?.nome || null,
                        categoria_id: v.categoria?.id || p.categoria?.id || null,
                        [colIdLoja]: v.id 
                    }, { onConflict: 'sku' });
                } catch (errVar) {
                    console.error(`❌ Erro ao salvar variação ${v.codigo}:`, errVar);
                }
            }
        }

        // 3. Processamento da Estrutura (Kits/Composições)
        const componentes = p.estrutura?.componentes || [];

        if (componentes.length > 0) {
          // Limpa composições antigas
          await supabase.from('composicoes').delete().eq('sku_pai', skuPrincipal);

          for (const comp of componentes) {
            const idBlingFilho = comp.produto.id;
            const qtdFilho = comp.quantidade;

            // Busca o SKU do componente pelo ID do Bling
            // Se o componente for um produto novo que ainda não caiu no webhook, isso pode falhar.
            // O ideal seria buscar no Bling se não achar no banco, mas para performance, confiamos no banco.
            const { data: produtoFilho } = await supabase
              .from('produtos')
              .select('sku')
              .eq(colIdLoja, idBlingFilho)
              .single();

            if (produtoFilho) {
              const { error: errComp } = await supabase.from('composicoes').upsert({
                sku_pai: skuPrincipal,
                sku_filho: produtoFilho.sku,
                quantidade_filho: qtdFilho
              });
              if (errComp) console.error(`❌ Erro ao salvar composição ${skuPrincipal}->${produtoFilho.sku}:`, errComp.message);
            } else {
              console.warn(`⚠️ Componente ID ${idBlingFilho} não encontrado no banco. Composição incompleta.`);
            }
          }
          console.log(`🧩 Composição de ${skuPrincipal} sincronizada.`);
        } else {
           // Se não tem estrutura, remove qualquer resquício
           await supabase.from('composicoes').delete().eq('sku_pai', skuPrincipal);
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("❌ ERRO WEBHOOK:", e.message);
    return new Response(e.message, { status: 500 });
  }
});