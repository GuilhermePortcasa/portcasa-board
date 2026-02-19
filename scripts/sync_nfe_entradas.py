import os
import requests
import time
from datetime import datetime, timedelta
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES DINÂMICAS ---
# Busca NFs emitidas nos últimos 7 dias (garante que não perde nada se o script falhar um dia)
DIAS_RETROATIVOS = 19
DATA_INICIO = (datetime.now() - timedelta(days=DIAS_RETROATIVOS)).strftime("%Y-%m-%d")

SITUACOES_PADRAO_IGNORAR = [1, 2, 3, 8, 10, 11, 12] 

BLACKLIST_FORNECEDORES = [
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
]

CONFIG_LOJAS = [
    {
        "nome": "PORTFIO",
        "id_loja_permitido": 0,
        "situacoes_ignorar": SITUACOES_PADRAO_IGNORAR,
        "naturezas_ignorar": [15107012796, 6937065086, 15103347853, 7255067378, 7314982489, 7256147975]
    },
    {
        "nome": "PORTCASA",
        "id_loja_permitido": 0,
        "situacoes_ignorar": SITUACOES_PADRAO_IGNORAR,
        "naturezas_ignorar": [15105899604, 15104895197, 15108451958, 15106005559, 15104888811, 15104888810, 15104888812, 15105145131, 15104888813, 15104888814]
    }
]

def normalizar_texto(texto):
    if not texto: return ""
    return " ".join(texto.split()).upper()

def salvar_compras(lote):
    if not lote: return
    headers = {
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", "Content-Type": "application/json"
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/entradas_compras", headers=headers, json=lote)
    if r.status_code not in [200, 201, 204]:
        print(f"      ❌ Erro Supabase: {r.text}")
    else:
        print(f"      ✅ {len(lote)} itens de compra salvos.")

def processar_loja(config):
    nome_loja = config['nome']
    print(f"\n🚀 Iniciando compras: {nome_loja} (A partir de {DATA_INICIO})")
    service = BlingService(nome_loja)
    blacklist_norm = set([normalizar_texto(x) for x in BLACKLIST_FORNECEDORES])
    
    # tipo: 0 (Entrada)
    params = {"dataEmissaoInicial": f"{DATA_INICIO} 00:00:00", "tipo": 0, "limite": 100}
    
    try:
        for lote in service.get_all_pages("/nfe", params=params):
            buffer = []
            for nf_resumo in lote:
                if nf_resumo.get('situacao') in config['situacoes_ignorar']: continue
                if nf_resumo.get('naturezaOperacao', {}).get('id') in config['naturezas_ignorar']: continue

                try:
                    time.sleep(0.05) # Rate limit Bling
                    url_det = f"https://www.bling.com.br/Api/v3/nfe/{nf_resumo['id']}"
                    token = service.get_valid_token()
                    resp = requests.get(url_det, headers={"Authorization": f"Bearer {token}"})

                    if resp.status_code != 200: continue
                    nf = resp.json().get('data')
                    if not nf: continue
                    
                    if nf.get('loja', {}).get('id') != config['id_loja_permitido']: continue

                    nome_fornecedor = nf.get('contato', {}).get('nome', '')
                    if any(bloqueado in normalizar_texto(nome_fornecedor) for bloqueado in blacklist_norm): continue

                    val_frete_total = nf.get('valorFrete', 0) or 0
                    val_outras_total = nf.get('outrasDespesas', 0) or 0
                    
                    itens = nf.get('itens', [])
                    soma_produtos = sum([(i.get('valor', 0) * i.get('quantidade', 0)) for i in itens])
                    if soma_produtos == 0: soma_produtos = 1

                    for item in itens:
                        sku = item.get('codigo', '').strip()
                        if not sku:
                            continue

                        qtd = item.get('quantidade', 0)
                        valor_bruto_unitario = item.get('valor', 0)
                        total_bruto_item = valor_bruto_unitario * qtd
                        
                        peso_item = total_bruto_item / soma_produtos
                        
                        frete_unitario = ((val_frete_total + val_outras_total) * peso_item) / qtd if qtd > 0 else 0
                        
                        total_ipi_item = item.get('impostos', {}).get('ipi', {}).get('valor', 0) or 0
                        ipi_unitario = total_ipi_item / qtd if qtd > 0 else 0
                        
                        desc_item_unitario = item.get('desconto', 0) or 0
                        
                        buffer.append({
                            "id_bling": nf['id'],
                            "sku": sku,
                            "data_entrada": nf['dataEmissao'][:10],
                            "quantidade": qtd,
                            "custo_unitario": valor_bruto_unitario,
                            "desconto": desc_item_unitario,
                            "frete": frete_unitario,
                            "ipi": ipi_unitario,
                            "nfe": str(nf.get('numero')),
                            "fornecedor": nome_fornecedor,
                            "loja": nome_loja
                        })
                except Exception as e:
                    print(f"   ⚠️ Erro NF {nf_resumo['id']}: {e}")
            
            if buffer: salvar_compras(buffer)
    except Exception as e:
        print(f"❌ Erro crítico em {nome_loja}: {e}")

if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Erro: SUPABASE_URL e SUPABASE_KEY são obrigatórios.")
        exit(1)
        
    for loja in CONFIG_LOJAS:
        processar_loja(loja)