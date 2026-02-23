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
const ORDEM_TAMANHOS = ["INFANTIL", "SOLTEIRO", "CASAL", "QUEEN", "KING", "ROSTO", "BANHO", "BANHÃO"];

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

  // --- 2. PROCESSAMENTO (100% Baseado em Tags - SKU por SKU) ---
  const { dadosPivot, opcoesFiltro, colunasDinamicas } = useMemo(() => {
    const agrupado: Record<string, any> = {};
    
    // Coletores para as caixas de Seleção
    const setForn = new Set<string>();
    const setTipo = new Set<string>();
    const setLinha = new Set<string>();
    const setTecido = new Set<string>();
    const setPecas = new Set<string>();
    const setColunas = new Set<string>();

    rawData.forEach((item) => {
      // EXCLUSÃO IMEDIATA: Pula kits estruturais e qualquer produto que NÃO TENHA TAG CADASTRADA
      if (item.tipo === 'E' || !item.tags_string || !item.tag_produto) return;

      let est = 0, v30 = 0, v60 = 0, v90 = 0, andamento = 0;
      
      if (canalAtivo === "loja") {
        est = Number(item.est_loja || 0);
        v30 = Number(item.v_qtd_30d_loja || 0);
        v60 = Number(item.v_qtd_60d_loja || 0);
       // v90 = Number(item.v_qtd_90d_loja || 0); // descomente para poder buscar v90
        andamento = Number(item.qtd_andamento_loja || 0);
      } else if (canalAtivo === "site") {
        est = Number(item.est_site || 0) + Number(item.est_full || 0);
        v30 = Number(item.v_qtd_30d_site || 0);
        v60 = Number(item.v_qtd_60d_site || 0);
       // v90 = Number(item.v_qtd_90d_site || 0); // descomente para poder buscar v90
        andamento = Number(item.qtd_andamento_site || 0);
      } else {
        est = Number(item.est_total || 0);
        v30 = Number(item.v_qtd_30d_site || 0) + Number(item.v_qtd_30d_loja || 0);
        v60 = Number(item.v_qtd_60d_site || 0) + Number(item.v_qtd_60d_loja || 0);
      //  v90 = Number(item.v_qtd_90d_site || 0) + Number(item.v_qtd_90d_loja || 0); // descomente para poder buscar v90
        andamento = Number(item.qtd_andamento || 0);
      }

      // EXCLUSÃO: Oculta inativos e zerados
      if (est === 0 && v60 === 0 && andamento === 0) return;
      // troca para if (est === 0 && v90 === 0 && andamento === 0) return; se quiser ver v90

      // EXTRATORES (Direto das Tags do BD)
      const sku = item.sku;
      const nome = item.nome;
      const forn = (item.fornecedor || "SEM FORNECEDOR").trim();
      const tipo = (item.tag_produto || "Sem Produto").trim();
      const linha = (item.tag_linha || "Sem Linha").trim();
      const tecido = (item.tag_tecido || "Sem Tecido").trim();
      const tamanho = (item.tag_tamanho || "ÚNICO").trim().toUpperCase();
      
      // Tratamento de Peças para garantir o texto "Peças"
      let pecas = (item.tag_pecas || "").trim();
      if (pecas !== "" && !isNaN(Number(pecas))) pecas = `${pecas} Peças`;

      // LÓGICA DE FILTROS RESPONSIVOS (CASCATA)
      const matchForn = fForn === "all" || forn === fForn;
      const matchTipo = fTipo === "all" || tipo === fTipo;
      const matchLinha = fLinha === "all" || linha === fLinha;
      const matchTecido = fTecido === "all" || tecido === fTecido;
      const matchPecas = fPecas === "all" || pecas === fPecas;

      // Alimenta os selects APENAS se a linha passar em todos os OUTROS filtros
      if (matchTipo && matchLinha && matchTecido && matchPecas) setForn.add(forn);
      if (matchForn && matchLinha && matchTecido && matchPecas) setTipo.add(tipo);
      if (matchForn && matchTipo && matchTecido && matchPecas) setLinha.add(linha);
      if (matchForn && matchTipo && matchLinha && matchPecas) if (tecido) setTecido.add(tecido);
      if (matchForn && matchTipo && matchLinha && matchTecido) if (pecas) setPecas.add(pecas);

      // Aplica os filtros para a Tabela: Só continua se casar com TODOS
      if (!(matchForn && matchTipo && matchLinha && matchTecido && matchPecas)) return;

      // NOVO: A coluna agora é a união de Tamanho + Peças (Ex: "SOLTEIRO - 3 PEÇAS")
      const colunaChave = pecas ? `${tamanho} - ${pecas.toUpperCase()}` : tamanho;
      setColunas.add(colunaChave);

      const custo = Number(item.custo_ult_ent || item.custo_final || 0);
      const preco = Number(canalAtivo === "site" ? (item.ultimo_preco_site || item.preco_venda_padrao) : item.preco_venda_padrao || 0);

      // HIERARQUIA PLANA: Fornecedor -> SKU
      if (!agrupado[forn]) agrupado[forn] = { nome: forn, skus: {} };
      if (!agrupado[forn].skus[sku]) {
        agrupado[forn].skus[sku] = { 
          sku: sku, 
          nome: nome, 
          colunas: {} // Guarda os valores dentro da coluna específica desse SKU
        };
      }

      const skuObj = agrupado[forn].skus[sku];

      if (!skuObj.colunas[colunaChave]) {
        skuObj.colunas[colunaChave] = { est: 0, v30: 0, v60: 0, custo: 0, preco: 0 };
      }

      // Preenche os dados exatos na interseção SKU x Coluna
      skuObj.colunas[colunaChave].est += est;
      skuObj.colunas[colunaChave].v30 += v30;
      skuObj.colunas[colunaChave].v60 += v60;
      skuObj.colunas[colunaChave].custo = Math.max(skuObj.colunas[colunaChave].custo, custo);
      skuObj.colunas[colunaChave].preco = Math.max(skuObj.colunas[colunaChave].preco, preco);
    });

    // ORGANIZA AS COLUNAS DINÂMICAS LENDO A ORDEM DOS TAMANHOS
    const arrayColunas = Array.from(setColunas).sort((a, b) => {
      const tamA = a.split(" - ")[0];
      const tamB = b.split(" - ")[0];
      const idxA = ORDEM_TAMANHOS.indexOf(tamA);
      const idxB = ORDEM_TAMANHOS.indexOf(tamB);
      
      if (idxA !== -1 && idxB !== -1) {
        if (idxA === idxB) return a.localeCompare(b); // Se mesmo tamanho, desempata pelas peças
        return idxA - idxB;
      }
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const termo = busca.toLowerCase();
    
    // Converte os objetos em Arrays para o Map do React
    let resultadoFinal = Object.values(agrupado).map((f: any) => {
      let skusArray = Object.values(f.skus).sort((a: any, b: any) => a.nome.localeCompare(b.nome));

      // Busca Livre (Procura no SKU ou no Nome)
      if (termo) {
        skusArray = skusArray.filter((s: any) => 
          s.sku.toLowerCase().includes(termo) || 
          s.nome.toLowerCase().includes(termo) ||
          f.nome.toLowerCase().includes(termo)
        );
      }

      return { ...f, skusArray };
    });

    resultadoFinal = resultadoFinal.filter(f => f.skusArray.length > 0);
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
    // 1. Monta o Cabeçalho Dinâmico
    let cabecalho = ["Fornecedor", "SKU", "Produto Original"];
    colunasDinamicas.forEach(col => {
      cabecalho.push(`${col} (EST)`);
      cabecalho.push(`${col} (V.30)`);
      cabecalho.push(`${col} (V.60)`);
      cabecalho.push(`${col} (CUSTO)`);
      cabecalho.push(`${col} (VENDA)`);
    });
    let csvContent = cabecalho.join(";") + "\n";

    // 2. Monta as linhas horizontais
    dadosPivot.forEach((forn: any) => {
      forn.skusArray.forEach((prod: any) => {
        let linhaCSV = [
          `"${forn.nome}"`,
          `"${prod.sku}"`,
          `"${prod.nome.replace(/"/g, '""')}"`
        ];

        colunasDinamicas.forEach(col => {
          const stats = prod.colunas[col];
          if (stats) {
            linhaCSV.push(
              stats.est,
              stats.v30,
              stats.v60,
              stats.custo.toFixed(2).replace('.', ','),
              stats.preco.toFixed(2).replace('.', ',')
            );
          } else {
            linhaCSV.push("-", "-", "-", "-", "-"); // Preenche os vazios
          }
        });
        
        csvContent += linhaCSV.join(";") + "\n";
      });
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Relatorio_Matriz_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                  <th className="sticky top-0 left-0 z-40 bg-slate-900 p-3 border-r border-slate-700 w-[400px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]" rowSpan={2}>
                    PRODUTO (SKU E NOME ORIGINAL)
                  </th>
                  {colunasDinamicas.length === 0 && (
                    <th className="p-2 border-r border-slate-700 text-center font-bold text-[11px] bg-slate-800">
                      SELECIONE UM FILTRO
                    </th>
                  )}
                  {colunasDinamicas.map(col => (
                    <th key={col} colSpan={3} className="p-2 border-r border-slate-700 text-center font-bold tracking-widest text-[10px] bg-slate-800 uppercase">
                      {col}
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-800 text-[10px] text-slate-300">
                  {colunasDinamicas.map(col => (
                    <React.Fragment key={`sub-${col}`}>
                      <th className="p-2 text-center border-r border-slate-700 w-20 text-emerald-400">ESTOQUE</th>
                      <th className="p-2 text-center border-r border-slate-700 w-20">VENDA 30</th>
                      <th className="p-2 text-center border-r border-slate-700 w-20">VENDA 60</th>
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
              
              {dadosPivot.map((forn) => (
                <React.Fragment key={forn.nome}>
                  {/* FORNECEDOR */}
                  <tr className="bg-slate-300 border-y border-slate-400">
                    <td className="sticky left-0 z-10 bg-slate-300 p-2 font-black text-slate-800 uppercase flex items-center gap-2 text-[11px] border-r border-slate-400 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <Store size={14}/> {forn.nome}
                    </td>
                    <td colSpan={colunasDinamicas.length * 3} className="bg-slate-300"></td>
                  </tr>

                  {/* LISTA PLANA DE SKUs */}
                  {forn.skusArray.map((prod: any) => (
                    <tr key={prod.sku} className="hover:bg-slate-50 transition-colors border-b border-slate-200">
                      
                      {/* NOME DO PRODUTO FIXO À ESQUERDA */}
                      <td className="sticky left-0 z-10 bg-white p-2 pl-4 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {prod.sku}
                          </span>
                          <span className="font-semibold text-slate-700 text-[11px] leading-tight">
                            {prod.nome}
                          </span>
                        </div>
                      </td>
                      
                      {/* DADOS NAS COLUNAS DINÂMICAS */}
                      {colunasDinamicas.map(col => {
                        const stats = prod.colunas[col];

                        if (!stats) {
                          // Se o SKU não pertence a essa coluna (ex: o SKU é Queen e a coluna é King), fica vazio
                          return (
                            <React.Fragment key={`${prod.sku}-empty-${col}`}>
                              <td className="border-r bg-slate-50/20 text-center text-slate-300">-</td>
                              <td className="border-r bg-slate-50/20 text-center text-slate-300">-</td>
                              <td className="border-r bg-slate-50/20 text-center text-slate-300">-</td>
                            </React.Fragment>
                          );
                        }

                        return (
                          <React.Fragment key={`${prod.sku}-${col}`}>
                            <td className="py-1.5 px-2 text-center border-r bg-white">
                              <div className="font-bold text-emerald-600">{stats.est > 0 ? fNum(stats.est) : "-"}</div>
                              {stats.custo > 0 && <div className="text-[9px] text-orange-500 font-semibold mt-0.5">C: {fCurrency(stats.custo)}</div>}
                            </td>
                            <td className="py-1.5 px-2 text-center border-r bg-white">
                              <div className="font-bold text-slate-700">{stats.v30 > 0 ? fNum(stats.v30) : "-"}</div>
                              {stats.preco > 0 && <div className="text-[9px] text-blue-600 font-bold mt-0.5">V: {fCurrency(stats.preco)}</div>}
                            </td>
                            <td className="py-1.5 px-2 text-center border-r bg-white font-medium text-slate-500">
                              {stats.v60 > 0 ? fNum(stats.v60) : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
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