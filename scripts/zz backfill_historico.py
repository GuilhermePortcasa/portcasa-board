import os
import requests
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
EXCEL_URL = "https://docs.google.com/spreadsheets/d/1udaqSsONYC64LFc6VT6_pSg-m-T_sjzi/export?format=xlsx"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

def rodar_backfill():
    print("📂 Lendo planilha de estoque...")
    df_planilha = pd.read_excel(EXCEL_URL)
    
    for _, row in df_planilha.iterrows():
        dt_registro = pd.to_datetime(row['Data']).strftime("%Y-%m-%d")
        
        payload = {
            "data": dt_registro,
            "estoque_loja": float(row['Estoque Loja']),
            "estoque_site": float(row['Estoque Site'])
        }
        
        print(f"✅ Salvando Estoque Inicial: {dt_registro}")
        requests.post(f"{SUPABASE_URL}/rest/v1/historico_resumo", headers=HEADERS, json=payload)

if __name__ == "__main__":
    rodar_backfill()