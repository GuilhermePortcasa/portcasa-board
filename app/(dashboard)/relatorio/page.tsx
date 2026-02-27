"use client";

import React, { useMemo, useState, useRef } from "react";
import { useDashboard } from "@/providers/dashboard-context";
import { Card } from "@/components/ui/card";
import { FileBarChart, Search, Store, Filter, PackageX, Maximize, Minimize, Download, ZoomIn, ZoomOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v || 0);

// 1. ORDEM OFICIAL DE TAMANHOS (Adicionado INFANTIL antes de SOLTEIRO)
const ORDEM_TAMANHOS = ["INFANTIL", "SOLTEIRO", "CASAL", "QUEEN", "KING", "LAVABO", "ROSTO", "BANHO", "BANHÃO"];

export default function RelatorioMatrizPage() {
  const { rawData, loading } = useDashboard();
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canalAtivo, setCanalAtivo] = useState<"geral" | "loja" | "site">("geral");
  const [zoomLevel, setZoomLevel] = useState(1); // NOVO: Estado do Zoom

  // --- NOVO: REFERÊNCIAS E ESTADOS PARA ARRASTAR COM O MOUSE ---
  const tableRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!tableRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - tableRef.current.offsetLeft);
    setScrollLeft(tableRef.current.scrollLeft);
  };
  const handleMouseLeave = () => setIsDragging(false);
  const handleMouseUp = () => setIsDragging(false);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !tableRef.current) return;
    e.preventDefault();
    const x = e.pageX - tableRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // Velocidade do arrasto
    tableRef.current.scrollLeft = scrollLeft - walk;
  };

  // Filtros UI
  const [busca, setBusca] = useState("");
  const [fForn, setFForn] = useState("all");
  const [fTipo, setFTipo] = useState("all");
  const [fLinha, setFLinha] = useState("all");
  const [fTecido, setFTecido] = useState("all");
  const [fPecas, setFPecas] = useState("all"); // NOVO: Filtro de Peças

  // --- 2. PROCESSAMENTO (Otimizado, Lado a Lado e Fallback de Nome) ---
  const { dadosPivot, opcoesFiltro, colunasDinamicas } = useMemo(() => {
    const agrupado: Record<string, any> = {};
    
    const setForn = new Set<string>();
    const setTipo = new Set<string>();
    const setLinha = new Set<string>();
    const setTecido = new Set<string>();
    const setPecas = new Set<string>();
    const setColunas = new Set<string>();

    rawData.forEach((item) => {
      if (item.tipo === 'E' || !item.tags_string || !item.tag_produto) return;

      // Pegamos as métricas separadas para usar no modo "Lado a Lado"
      const estLoja = Number(item.est_loja || 0);
      const estSite = Number(item.est_site || 0) + Number(item.est_full || 0);
      const v30Loja = Number(item.v_qtd_30d_loja || 0);
      const v30Site = Number(item.v_qtd_30d_site || 0);
      const v60Loja = Number(item.v_qtd_60d_loja || 0);
      const v60Site = Number(item.v_qtd_60d_site || 0);

      let totalEst = 0, totalV60 = 0, andamento = 0;
      
      // Filtro de Exclusão (Para não renderizar lixo zerado dependendo da aba)
      if (canalAtivo === "loja") {
        totalEst = estLoja; totalV60 = v60Loja; andamento = Number(item.qtd_andamento_loja || 0);
      } else if (canalAtivo === "site") {
        totalEst = estSite; totalV60 = v60Site; andamento = Number(item.qtd_andamento_site || 0);
      } else {
        totalEst = estLoja + estSite; totalV60 = v60Loja + v60Site; andamento = Number(item.qtd_andamento || 0);
      }

      if (totalEst === 0 && totalV60 === 0 && andamento === 0) return;

      const sku = item.sku;
      const nomeOriginal = item.nome || "";
      const forn = (item.fornecedor || "SEM FORNECEDOR").trim();
      const tipo = (item.tag_produto || "").trim();
      const linha = (item.tag_linha || "").trim();
      const tecido = (item.tag_tecido || "").trim();
      const tamanho = (item.tag_tamanho || "ÚNICO").trim().toUpperCase();
      
      let pecas = (item.tag_pecas || "").trim();
      if (pecas !== "" && !isNaN(Number(pecas))) pecas = `${pecas} Peças`;

      const matchForn = fForn === "all" || forn === fForn;
      const matchTipo = fTipo === "all" || tipo === fTipo;
      const matchLinha = fLinha === "all" || linha === fLinha;
      const matchTecido = fTecido === "all" || tecido === fTecido;
      const matchPecas = fPecas === "all" || pecas === fPecas;

      if (matchTipo && matchLinha && matchTecido && matchPecas) setForn.add(forn);
      if (matchForn && matchLinha && matchTecido && matchPecas) if (tipo) setTipo.add(tipo);
      if (matchForn && matchTipo && matchTecido && matchPecas) if (linha) setLinha.add(linha);
      if (matchForn && matchTipo && matchLinha && matchPecas) if (tecido) setTecido.add(tecido);
      if (matchForn && matchTipo && matchLinha && matchTecido) if (pecas) setPecas.add(pecas);

      if (!(matchForn && matchTipo && matchLinha && matchTecido && matchPecas)) return;

      // 1. CRIAÇÃO DO NOME DO PAI COM FALLBACK E LIMPEZA DE TAMANHO
      let nomePai = "";
      const isOutros = linha.toUpperCase() === "OUTROS" || tipo.toUpperCase() === "OUTROS";
      const isIncompleto = !tipo || !linha || tipo === "Sem Produto" || linha === "Sem Linha";

      if (isOutros || isIncompleto) {
        // Fallback: Usa o nome original até os 2 pontos (:)
        let fallbackNome = (item.nome_pai || nomeOriginal).split(":")[0].toUpperCase();
        
        // OTIMIZAÇÃO: Remove o tamanho do nome do produto para garantir que o grupo case perfeitamente
        if (tamanho && tamanho !== "ÚNICO") {
          if (tamanho === "KING") {
            // Truque seguro: Mascara o Super King/S.King temporariamente, apaga o King, depois volta o Super
            fallbackNome = fallbackNome.replace(/SUPER KING/g, "##SK##").replace(/S\.KING/g, "##SK##");
            fallbackNome = fallbackNome.replace(new RegExp(`\\bKING\\b`, "g"), "");
            fallbackNome = fallbackNome.replace(/##SK##/g, "SUPER KING");
          } else if (tamanho === "SUPER KING" || tamanho === "S.KING") {
            fallbackNome = fallbackNome.replace(/SUPER KING/g, "").replace(/S\.KING/g, "");
          } else {
            fallbackNome = fallbackNome.replace(new RegExp(`\\b${tamanho}\\b`, "g"), "");
          }
        }
        
        // Limpa espaços duplos e hífens abandonados (ex: "JOGO -  AZUL" vira "JOGO AZUL")
        nomePai = fallbackNome.replace(/\s+/g, " ").replace(/ - /g, " ").trim();
        
      } else {
        // Monta Dinâmico
        const arrPai = [tipo, linha];
        if (pecas) arrPai.push(pecas);
        if (tecido && tecido !== "Sem Tecido") arrPai.push(tecido);
        nomePai = arrPai.join(" ");
      }

      // 2. EXTRAÇÃO DA VARIAÇÃO
      let variacao = "ÚNICA";
      if (nomeOriginal.includes(":")) {
        variacao = nomeOriginal.substring(nomeOriginal.indexOf(":") + 1).trim();
      } else if (nomeOriginal.includes("-")) {
        variacao = nomeOriginal.split("-").pop()?.trim() || "ÚNICA";
      }

      const colunaChave = tamanho;
      setColunas.add(colunaChave);

      const custo = Number(item.custo_ult_ent || item.custo_final || 0);
      const preco = Number(canalAtivo === "site" ? (item.ultimo_preco_site || item.preco_venda_padrao) : item.preco_venda_padrao || 0);

      // 4. AGRUPAMENTO
      if (!agrupado[forn]) agrupado[forn] = { nome: forn, produtos: {} };
      if (!agrupado[forn].produtos[nomePai]) agrupado[forn].produtos[nomePai] = { nome: nomePai, variacoes: {} };

      const prodObj = agrupado[forn].produtos[nomePai];

      if (!prodObj.variacoes[variacao]) {
        prodObj.variacoes[variacao] = { 
          nome: variacao, 
          // OTIMIZAÇÃO DE PERFORMANCE: Pré-calcula a string de busca uma única vez
          searchString: `${sku} ${nomePai} ${variacao}`.toLowerCase(),
          colunas: {} 
        };
      }

      const varObj = prodObj.variacoes[variacao];

      if (!varObj.colunas[colunaChave]) {
        varObj.colunas[colunaChave] = { 
          estLoja: 0, estSite: 0, 
          v30Loja: 0, v30Site: 0, 
          v60Loja: 0, v60Site: 0, 
          custo: 0, preco: 0 
        };
      }

      // Acumula mantendo a separação
      varObj.colunas[colunaChave].estLoja += estLoja;
      varObj.colunas[colunaChave].estSite += estSite;
      varObj.colunas[colunaChave].v30Loja += v30Loja;
      varObj.colunas[colunaChave].v30Site += v30Site;
      varObj.colunas[colunaChave].v60Loja += v60Loja;
      varObj.colunas[colunaChave].v60Site += v60Site;
      varObj.colunas[colunaChave].custo = Math.max(varObj.colunas[colunaChave].custo, custo);
      varObj.colunas[colunaChave].preco = Math.max(varObj.colunas[colunaChave].preco, preco);
    });

    // ORGANIZA COLUNAS
    const arrayColunas = Array.from(setColunas).sort((a, b) => {
      const idxA = ORDEM_TAMANHOS.indexOf(a);
      const idxB = ORDEM_TAMANHOS.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const termo = busca.toLowerCase();
    
    let resultadoFinal = Object.values(agrupado).map((f: any) => {
      let prodsArray = Object.values(f.produtos).map((p: any) => {
        let varsArray = Object.values(p.variacoes).sort((a: any, b: any) => a.nome.localeCompare(b.nome));
        return { ...p, varsArray };
      }).sort((a: any, b: any) => a.nome.localeCompare(b.nome));

      // Busca Ultra-Rápida usando a searchString cacheada
      if (termo) {
        prodsArray = prodsArray.filter((p: any) => 
          p.varsArray.some((v: any) => v.searchString.includes(termo))
        );
      }

      return { ...f, prodsArray };
    });

    resultadoFinal = resultadoFinal.filter(f => f.prodsArray.length > 0);
    resultadoFinal.sort((a, b) => a.nome.localeCompare(b.nome));

    return {
      dadosPivot: resultadoFinal,
      colunasDinamicas: arrayColunas, 
      opcoesFiltro: {
        forn: Array.from(setForn).sort(),
        tipo: Array.from(setTipo).sort(),
        linha: Array.from(setLinha).sort(),
        tecido: Array.from(setTecido).sort(),
        pecas: Array.from(setPecas).sort(),
      }
    };
  }, [rawData, busca, fForn, fTipo, fLinha, fTecido, fPecas, canalAtivo]);

  // --- FUNÇÃO DE EXPORTAÇÃO EXCEL (CSV) ---
  const exportarParaExcel = () => {
    let cabecalho = ["Fornecedor", "Produto Principal", "Variacao (Cor/Modelo)"];
    
    colunasDinamicas.forEach(col => {
      if (canalAtivo === "geral") {
        cabecalho.push(`${col} (EST LOJA)`, `${col} (EST SITE)`, `${col} (V.30 LOJA)`, `${col} (V.30 SITE)`);
      } else {
        cabecalho.push(`${col} (EST)`, `${col} (V.30)`, `${col} (V.60)`, `${col} (CUSTO)`, `${col} (VENDA)`);
      }
    });
    
    let csvContent = cabecalho.join(";") + "\n";

    dadosPivot.forEach((forn: any) => {
      forn.prodsArray.forEach((prod: any) => {
        prod.varsArray.forEach((vr: any) => {
          let linhaCSV = [`"${forn.nome}"`, `"${prod.nome.replace(/"/g, '""')}"`, `"${vr.nome.replace(/"/g, '""')}"`];

          colunasDinamicas.forEach(col => {
            const stats = vr.colunas[col];
            if (!stats) {
              linhaCSV.push(...Array(canalAtivo === "geral" ? 4 : 5).fill("-"));
            } else if (canalAtivo === "geral") {
              linhaCSV.push(stats.estLoja, stats.estSite, stats.v30Loja, stats.v30Site);
            } else {
              const estValue = canalAtivo === "loja" ? stats.estLoja : stats.estSite;
              const v30Value = canalAtivo === "loja" ? stats.v30Loja : stats.v30Site;
              const v60Value = canalAtivo === "loja" ? stats.v60Loja : stats.v60Site;
              linhaCSV.push(estValue, v30Value, v60Value, stats.custo.toFixed(2).replace('.', ','), stats.preco.toFixed(2).replace('.', ','));
            }
          });
          
          csvContent += linhaCSV.join(";") + "\n";
        });
      });
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Relatorio_Matriz_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.click();
    link.click();
  };

  if (loading) return <div className="p-10 text-center animate-pulse text-slate-500">Sincronizando Tags e Montando Matriz...</div>;

  return (
    // A div principal não muda mais de tamanho, quem fica Fullscreen é o Card da Tabela
    <div className="space-y-4 pb-10 max-w-[1800px] mx-auto pt-6 px-4">
      
      {/* Esconde TUDO isso quando estiver em tela cheia */}
      {!isFullscreen && (
        <>
          {/* CABEÇALHO */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border shadow-sm">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileBarChart className="text-blue-600" /> Relatório SKU por SKU (Tags)
              </h1>
              <p className="text-sm text-slate-500 mt-1">Visão plana de produtos originais filtrados pelas Tags do ERP.</p>
            </div>
            <div className="flex items-center gap-4 w-full md:w-auto">
              <Tabs value={canalAtivo} onValueChange={(v: any) => setCanalAtivo(v)} className="w-full sm:w-auto">
                <TabsList className="grid grid-cols-3 h-10">
                  <TabsTrigger value="geral">Geral</TabsTrigger>
                  <TabsTrigger value="loja">Loja</TabsTrigger>
                  <TabsTrigger value="site">Site</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* FILTROS */}
          <Card className="p-4 border-none shadow-md bg-white">
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {/* O conteúdo das caixas de seleção fica exatamante igual você já tinha... */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Linha</label>
                <select value={fLinha} onChange={e => setFLinha(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="all">Todas as Linhas</option>
                  {opcoesFiltro.linha.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Produto</label>
                <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="all">Todos os Produtos</option>
                  {opcoesFiltro.tipo.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Peças</label>
                <select value={fPecas} onChange={e => setFPecas(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="all">Todas</option>
                  {opcoesFiltro.pecas.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Tecido</label>
                <select value={fTecido} onChange={e => setFTecido(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="all">Todos</option>
                  {opcoesFiltro.tecido.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Fornecedor</label>
                <select value={fForn} onChange={e => setFForn(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="all">Todos</option>
                  {opcoesFiltro.forn.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 relative">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Busca (Nome/SKU)</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input placeholder="Buscar..." className="pl-8 h-9 text-xs" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* TABELA PLANA (Agora ela possui sua própria Toolbar e vira Fullscreen sozinha) */}
      <Card className={cn(
        "border-none shadow-xl overflow-hidden bg-white flex flex-col transition-all duration-300",
        isFullscreen ? "fixed inset-0 z-50 rounded-none w-screen h-screen" : "relative"
      )}>
        
        {/* TOOLBAR DA TABELA (Sempre visível) */}
        <div className="flex items-center justify-between p-2 bg-slate-50 border-b border-slate-200">
          <div className="text-xs font-bold text-slate-500 uppercase px-2 tracking-widest">
            {isFullscreen ? "Modo Foco: Matriz de Dados" : "Matriz de Dados"}
          </div>
          <div className="flex items-center gap-1 bg-white p-1 rounded-md border border-slate-200 shadow-sm">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-blue-600" onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))} title="Diminuir Zoom"><ZoomOut size={16}/></Button>
            <span className="text-[11px] font-bold text-slate-600 w-10 text-center select-none">{Math.round(zoomLevel * 100)}%</span>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-blue-600" onClick={() => setZoomLevel(z => Math.min(2, z + 0.1))} title="Aumentar Zoom"><ZoomIn size={16}/></Button>
            <div className="w-px h-4 bg-slate-300 mx-1"></div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 gap-1 text-[11px] font-semibold" onClick={exportarParaExcel} title="Baixar Excel"><Download size={14}/> CSV</Button>
            <div className="w-px h-4 bg-slate-300 mx-1"></div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 gap-1 text-[11px] font-semibold" onClick={() => setIsFullscreen(!isFullscreen)}>
              {isFullscreen ? <><Minimize size={14}/> Sair</> : <><Maximize size={14}/> Expandir</>}
            </Button>
          </div>
        </div>

        {/* CONTAINER DE ARRASTAR E ZOOM */}
        <div 
          ref={tableRef}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          className={cn(
            "overflow-x-auto overflow-y-auto relative select-none flex-1", 
            isFullscreen ? "h-[calc(100vh-50px)]" : "max-h-[65vh]",
            isDragging ? "cursor-grabbing" : "cursor-grab"
          )}
        >
          {/* Aplicação do ZOOM via CSS diretamente na tabela */}
          <div style={{ zoom: zoomLevel }}>
            <table className="w-full text-sm text-left border-collapse min-w-[1000px]">
              
              <thead className="bg-slate-900 text-white sticky top-0 z-30 shadow-md">
                <tr>
                  <th className="sticky top-0 left-0 z-40 bg-slate-900 p-3 border-r border-slate-700 w-[350px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]" rowSpan={2}>
                    PRODUTO / VARIAÇÃO
                  </th>
                  {colunasDinamicas.length === 0 && (
                    <th className="p-2 border-r border-slate-700 text-center font-bold text-[11px] bg-slate-800">
                      SELECIONE UM FILTRO
                    </th>
                  )}
                  {colunasDinamicas.map(col => (
                    <th key={col} colSpan={canalAtivo === "geral" ? 6 : 3} className="p-2 border-r border-slate-700 text-center font-bold tracking-widest text-[10px] bg-slate-800 uppercase">
                      {col}
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-800 text-[9px] text-slate-300">
                  {colunasDinamicas.map(col => (
                    <React.Fragment key={`sub-${col}`}>
                      {canalAtivo === "geral" ? (
                        <>
                          <th className="p-1.5 text-center border-r border-slate-700/50 w-12 text-orange-400 bg-orange-950/20" title="Estoque Loja">E. LJ</th>
                          <th className="p-1.5 text-center border-r border-slate-700 w-12 text-blue-400 bg-blue-950/20" title="Estoque Site">E. ST</th>
                          <th className="p-1.5 text-center border-r border-slate-700/50 w-12 text-orange-200 bg-orange-950/20" title="Venda 30d Loja">V. LJ</th>
                          <th className="p-1.5 text-center border-r border-slate-700 w-12 text-blue-200 bg-blue-950/20" title="Venda 30d Site">V. ST</th>
                          <th className="p-1.5 text-center border-r border-slate-700/50 w-12 text-orange-200/50 bg-orange-950/20" title="Venda 60d Loja">60 LJ</th>
                          <th className="p-1.5 text-center border-r border-slate-700 w-12 text-blue-200/50 bg-blue-950/20" title="Venda 60d Site">60 ST</th>
                        </>
                      ) : (
                        <>
                          <th className="p-2 text-center border-r border-slate-700 w-20 text-emerald-400">ESTOQUE</th>
                          <th className="p-2 text-center border-r border-slate-700 w-20">VENDA 30</th>
                          <th className="p-2 text-center border-r border-slate-700 w-20">VENDA 60</th>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
              {dadosPivot.length === 0 && (
                <tr>
                  <td colSpan={3 + (colunasDinamicas.length * 3)} className="p-16 text-center text-slate-500">
                    <PackageX size={32} className="opacity-20 mb-2 mx-auto" />
                    Nenhum produto atende aos filtros ou as TAGS não foram importadas.
                  </td>
                </tr>
              )}
              
              {dadosPivot.map((forn: any) => (
                <React.Fragment key={forn.nome}>
                  {/* FORNECEDOR (Nível 1) */}
                  <tr className="bg-slate-300 border-y border-slate-400">
                    <td className="sticky left-0 z-10 bg-slate-300 p-2 font-black text-slate-800 uppercase flex items-center gap-2 text-[11px] border-r border-slate-400 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <Store size={14}/> {forn.nome}
                    </td>
                    <td colSpan={colunasDinamicas.length * 3} className="bg-slate-300"></td>
                  </tr>

                  {forn.prodsArray.map((prod: any) => (
                    <React.Fragment key={prod.nome}>
                      {/* PRODUTO PAI DINÂMICO (Nível 2) */}
                      <tr className="bg-slate-100/80 border-b border-slate-200">
                        <td className="sticky left-0 z-10 bg-slate-100/80 p-2 pl-4 border-r font-bold text-slate-700 text-[11px] uppercase tracking-tight shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                          {prod.nome}
                        </td>
                        <td colSpan={colunasDinamicas.length * 3} className="bg-slate-100/80"></td>
                      </tr>

                      {/* VARIAÇÕES / CORES (Nível 3) */}
                      {prod.varsArray.map((vr: any) => (
                        <tr key={vr.nome} className="hover:bg-blue-50/30 transition-colors border-b border-slate-100">
                          
                          {/* NOME DA VARIAÇÃO À ESQUERDA */}
                          <td className="sticky left-0 z-10 bg-white p-2 pl-8 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                            <span className="font-semibold text-slate-600 text-[11px] leading-tight">
                              {vr.nome}
                            </span>
                          </td>
                          
                          {/* DADOS NAS COLUNAS DE TAMANHO */}
                          {colunasDinamicas.map(col => {
                            const stats = vr.colunas[col];
                            const isGeral = canalAtivo === "geral";

                            if (!stats) {
                              const emptyCells = isGeral ? 6 : 3;
                              return (
                                <React.Fragment key={`${vr.nome}-empty-${col}`}>
                                  {Array.from({ length: emptyCells }).map((_, i) => (
                                    <td key={i} className={`border-r bg-slate-50/40 text-center text-slate-200 ${isGeral && (i===1 || i===3 || i===5) ? 'border-r-slate-300' : ''}`}>-</td>
                                  ))}
                                </React.Fragment>
                              );
                            }

                            if (isGeral) {
                              return (
                                <React.Fragment key={`${vr.nome}-${col}`}>
                                  <td className="py-1.5 px-1 text-center border-r border-slate-100 bg-orange-50/30 font-bold text-orange-600">{stats.estLoja > 0 ? fNum(stats.estLoja) : "-"}</td>
                                  <td className="py-1.5 px-1 text-center border-r border-slate-300 bg-blue-50/30 font-bold text-blue-600">{stats.estSite > 0 ? fNum(stats.estSite) : "-"}</td>
                                  <td className="py-1.5 px-1 text-center border-r border-slate-100 bg-orange-50/10 font-bold text-slate-700">{stats.v30Loja > 0 ? fNum(stats.v30Loja) : "-"}</td>
                                  <td className="py-1.5 px-1 text-center border-r border-slate-300 bg-blue-50/10 font-bold text-slate-700">{stats.v30Site > 0 ? fNum(stats.v30Site) : "-"}</td>
                                  <td className="py-1.5 px-1 text-center border-r border-slate-100 bg-orange-50/10 text-slate-400">{stats.v60Loja > 0 ? fNum(stats.v60Loja) : "-"}</td>
                                  <td className="py-1.5 px-1 text-center border-r border-slate-300 bg-blue-50/10 text-slate-400">{stats.v60Site > 0 ? fNum(stats.v60Site) : "-"}</td>
                                </React.Fragment>
                              );
                            }

                            // Visão Específica (Loja ou Site individualmente)
                            const estValue = canalAtivo === "loja" ? stats.estLoja : stats.estSite;
                            const v30Value = canalAtivo === "loja" ? stats.v30Loja : stats.v30Site;
                            const v60Value = canalAtivo === "loja" ? stats.v60Loja : stats.v60Site;

                            return (
                              <React.Fragment key={`${vr.nome}-${col}`}>
                                <td className="py-1.5 px-2 text-center border-r bg-white">
                                  <div className="font-bold text-emerald-600">{estValue > 0 ? fNum(estValue) : "-"}</div>
                                  {stats.custo > 0 && <div className="text-[9px] text-orange-500 font-semibold mt-0.5">C: {fCurrency(stats.custo)}</div>}
                                </td>
                                <td className="py-1.5 px-2 text-center border-r bg-white">
                                  <div className="font-bold text-slate-700">{v30Value > 0 ? fNum(v30Value) : "-"}</div>
                                  {stats.preco > 0 && <div className="text-[9px] text-blue-600 font-bold mt-0.5">V: {fCurrency(stats.preco)}</div>}
                                </td>
                                <td className="py-1.5 px-2 text-center border-r bg-white font-medium text-slate-500">
                                  {v60Value > 0 ? fNum(v60Value) : "-"}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
              </tbody>
          </table>
          </div>
        </div>
      </Card>
    </div>
  );
}