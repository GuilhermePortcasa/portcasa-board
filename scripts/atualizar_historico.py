import os
import requests
import pd
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
    
    # 1. MODIFICADO: Puxa os dados instantâneos da MATERIALIZED VIEW (mview_)
    url_est = f"{SUPABASE_URL}/rest/v1/mview_dashboard_completa?select=est_loja,est_site,est_full,custo_final,tipo"
    r_est = requests.get(url_est, headers=HEADERS).json()
    df_est = pd.DataFrame(r_est)
    
    if df_est.empty: return

    # 2. APLICAMOS A TRAVA DE KIT (Igual ao React)
    df_est = df_est[df_est['tipo'] != 'E'].copy()

    # 3. Fazemos os cálculos
    total_est_loja = (df_est['est_loja'] * df_est['custo_final']).sum()
    total_est_site = ((df_est['est_site'] + df_est['est_full']) * df_est['custo_final']).sum()

    payload = {
        "data": hoje_br,
        "estoque_loja": float(total_est_loja),
        "estoque_site": float(total_est_site)
    }

    requests.post(f"{SUPABASE_URL}/rest/v1/historico_resumo", headers=HEADERS, json=payload)
    print(f"📊 Estoque do dia {hoje_br} registrado (Kits ignorados para evitar duplicidade).")

if __name__ == "__main__":
    processar_diario()