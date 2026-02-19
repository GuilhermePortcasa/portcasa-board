import os
import requests
import pandas as pd
from datetime import datetime, timedelta
import re

# Configurações do Supabase (Serão pegas do GitHub Secrets)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

def extrair_nome_base(descricao):
    if not descricao: return "Desconhecido"
    # Remove variações após os dois pontos e prefixos de kit
    base_name = descricao
    match = re.search(r'\s([A-Z]+):', base_name)
    if match: base_name = base_name[:match.start()].strip()
    base_name = re.sub(r'^(0 - |1 - )', '', base_name).strip()
    return base_name

def get_data_supabase(tabela, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{tabela}?{params}"
    r = requests.get(url, headers=HEADERS)
    if r.status_code == 200:
        return r.json()
    print(f"Erro ao buscar {tabela}: {r.text}")
    return []

def processar_diario():
    # Definimos a data de "Ontem" para o histórico
    ontem = (datetime.now() - timedelta(days=1)).date()
    data_str = ontem.strftime("%Y-%m-%d")
    
    print(f"🚀 Iniciando processamento do histórico para: {data_str}")

    # --- 1. CÁLCULO DE VALOR DE ESTOQUE ---
    # Pegamos os dados da view que já tem estoque e custo_final calculado
    # Usamos a view_dashboard_completa que criamos nos passos anteriores
    produtos = get_data_supabase("view_dashboard_completa", "select=est_loja,est_site,est_full,custo_final")
    df_est = pd.DataFrame(produtos)
    
    if not df_est.empty:
        df_est['val_loja'] = df_est['est_loja'] * df_est['custo_final']
        df_est['val_site'] = (df_est['est_site'] + df_est['est_full']) * df_est['custo_final']
        
        total_est_loja = float(df_est['val_loja'].sum())
        total_est_site = float(df_est['val_site'].sum())
    else:
        total_est_loja, total_est_site = 0, 0

    # --- 2. CÁLCULO DE VENDAS E TOP 3 ---
    # Buscamos vendas de ontem nas tabelas de saída
    # Nota: Adaptado para ler as tabelas brutas para pegar o nome e filtrar o dia exato
    query_vendas = f"data_emissao=eq.{data_str}"
    vendas_nfe = get_data_supabase("nfe_saida", f"{query_vendas}&select=sku,quantidade,valor_total_liquido,origem,nome_produto")
    
    query_pedidos = f"data_pedido=eq.{data_str}"
    vendas_ped = get_data_supabase("pedidos_venda", f"{query_pedidos}&select=sku,quantidade,valor_total_liquido,origem,nome_produto")

    df_vendas = pd.concat([pd.DataFrame(vendas_nfe), pd.DataFrame(vendas_ped)], ignore_index=True)

    vendas_loja_total = 0
    vendas_site_total = 0
    top3_loja_str = "Sem vendas"
    top3_site_str = "Sem vendas"

    if not df_vendas.empty:
        # Normaliza origem
        df_vendas['canal'] = df_vendas['origem'].apply(lambda x: 'LOJA' if x in ['LOJA', 'PORTCASA'] else 'SITE')
        
        # Totais Financeiros
        vendas_loja_total = float(df_vendas[df_vendas['canal'] == 'LOJA']['valor_total_liquido'].sum())
        vendas_site_total = float(df_vendas[df_vendas['canal'] == 'SITE']['valor_total_liquido'].sum())

        # Processamento de Nomes para Top 3
        df_vendas['nome_limpo'] = df_vendas['nome_produto'].apply(extrair_nome_base)
        
        # Top 3 Loja
        df_l = df_vendas[df_vendas['canal'] == 'LOJA']
        if not df_l.empty:
            top_l = df_l.groupby('nome_limpo')['quantidade'].sum().nlargest(3)
            top3_loja_str = "\n".join([f"{i+1}º. {name} ({int(qty)} un)" for i, (name, qty) in enumerate(top_l.items())])

        # Top 3 Site
        df_s = df_vendas[df_vendas['canal'] == 'SITE']
        if not df_s.empty:
            top_s = df_s.groupby('nome_limpo')['quantidade'].sum().nlargest(3)
            top3_site_str = "\n".join([f"{i+1}º. {name} ({int(qty)} un)" for i, (name, qty) in enumerate(top_s.items())])

    # --- 3. SALVAR NO SUPABASE ---
    payload = {
        "data": data_str,
        "estoque_loja": total_est_loja,
        "estoque_site": total_est_site,
        "vendas_loja": vendas_loja_total,
        "vendas_site": vendas_site_total,
        "top3_loja": top3_loja_str,
        "top3_site": top3_site_str
    }

    url_upsert = f"{SUPABASE_URL}/rest/v1/historico_resumo"
    r = requests.post(url_upsert, headers=HEADERS, json=payload)
    
    if r.status_code in [200, 201, 204]:
        print(f"✅ Histórico de {data_str} salvo com sucesso!")
    else:
        print(f"❌ Erro ao salvar histórico: {r.text}")

if __name__ == "__main__":
    processar_diario()