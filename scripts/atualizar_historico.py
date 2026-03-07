import os
import requests
import pandas as pd
from datetime import datetime
import pytz

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

def processar_diario():
    tz = pytz.timezone('America/Sao_Paulo')
    hoje_br = datetime.now(tz).strftime("%Y-%m-%d")
    
    print("⏳ Puxando dados da View Materializada...")
    
    # 1. Puxamos TODOS os dados necessários para aplicar as regras de negócio
    url_est = f"{SUPABASE_URL}/rest/v1/mview_dashboard_completa?select=sku,tipo,custo_final,est_total,est_loja,est_site,est_full,v_qtd_120d_geral,qtd_andamento"
    
    # Busca com paginação para garantir que vem a base inteira (caso passe de 1000 que é o limite padrão do postgrest)
    all_data = []
    offset = 0
    limit = 50000
    while True:
        r = requests.get(f"{url_est}&offset={offset}&limit={limit}", headers=HEADERS)
        if r.status_code != 200:
            print(f"❌ Erro ao buscar dados: {r.text}")
            return
        
        lote = r.json()
        if not lote:
            break
            
        all_data.extend(lote)
        offset += limit

    df = pd.DataFrame(all_data)
    if df.empty: 
        print("⚠️ Tabela vazia.")
        return

    # Converte tudo para numérico garantindo que nulos sejam 0
    cols_numericas = ['custo_final', 'est_total', 'est_loja', 'est_site', 'est_full', 'v_qtd_120d_geral', 'qtd_andamento']
    for col in cols_numericas:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    # 2. APLICAMOS A TRAVA DE KIT (Igual ao React: if p.tipo !== 'E')
    df = df[df['tipo'] != 'E'].copy()

    # 3. APLICAMOS O FILTRO DE PRODUTOS INATIVOS (A mesma lógica do isProductInCanal do React)
    # No dashboard geral, ele só processa se: est_total > 0 OR v_qtd_120d_geral > 0 OR qtd_andamento > 0
    filtro_ativo = (df['est_total'] > 0) | (df['v_qtd_120d_geral'] > 0) | (df['qtd_andamento'] > 0)
    df = df[filtro_ativo]

    # 4. Fazemos os cálculos FINAIS DE VALOR
    # Como já filtramos, agora é só multiplicar a quantidade física atual pelo custo final unitário
    total_est_loja = (df['est_loja'] * df['custo_final']).sum()
    
    # O site soma o físico do site mais o físico do full
    df['estoque_site_total'] = df['est_site'] + df['est_full']
    total_est_site = (df['estoque_site_total'] * df['custo_final']).sum()

    payload = {
        "data": hoje_br,
        "estoque_loja": float(total_est_loja),
        "estoque_site": float(total_est_site)
    }

    print(f"💰 Loja calculada: R$ {total_est_loja:,.2f}")
    print(f"💰 Site calculado: R$ {total_est_site:,.2f}")

    r_post = requests.post(f"{SUPABASE_URL}/rest/v1/historico_resumo", headers=HEADERS, json=payload)
    if r_post.status_code in [200, 201, 204]:
        print(f"✅ Estoque do dia {hoje_br} registrado com sucesso (Sincronizado com regras do Dashboard).")
    else:
        print(f"❌ Erro ao salvar histórico: {r_post.text}")

if __name__ == "__main__":
    processar_diario()