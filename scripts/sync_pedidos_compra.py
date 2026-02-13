import requests
import time
import os
from datetime import datetime, timedelta
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES IDENTIFICADAS ---
VALOR_SIT_EM_ANDAMENTO = 3
VALOR_SIT_ATENDIDO = 1

BLACKLIST_FORNECEDORES = [
    "COM DE FIOS E TECIDOS PORTFIO", "COMERCIO DE FIOS E TECIDOS PORTFIO LTDA",
    "PORTCASA ON LINE LTDA", "SONO E CONFORTO COMERCIO LTDA",
    "MULTIART COMERCIO IMPORTACAO LTDA", "MBF INDUSTRIA DE TECIDOS E CONFECCOES LTDA EPP"
]

def salvar_no_supabase(lote):
    if not lote: return
    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", 
        "Content-Type": "application/json"
    }
    # Destino único agora: compras_pedidos
    r = requests.post(f"{SUPABASE_URL}/rest/v1/compras_pedidos", headers=headers, json=lote)
    if r.status_code not in [200, 201, 204]:
        print(f"      ❌ Erro Supabase: {r.text}")

def processar_pedidos_compra(loja_nome):
    print(f"\n🚀 Sincronizando Pedidos de Compra: {loja_nome}")
    service = BlingService(loja_nome)
    
    # Busca pedidos dos últimos 60 dias
    data_inicio = (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")
    params = {"dataInicial": data_inicio, "limite": 100}

    try:
        for lote in service.get_all_pages("/pedidos/compras", params=params):
            buffer = []
            for p_resumo in lote:
                sit_valor = p_resumo.get('situacao', {}).get('valor')
                
                # Filtra apenas as situações alvo
                if sit_valor not in [VALOR_SIT_EM_ANDAMENTO, VALOR_SIT_ATENDIDO]:
                    continue

                try:
                    time.sleep(0.05)
                    token = service.get_valid_token()
                    resp = requests.get(
                        f"https://www.bling.com.br/Api/v3/pedidos/compras/{p_resumo['id']}", 
                        headers={"Authorization": f"Bearer {token}"}
                    )
                    if resp.status_code != 200: continue
                    p = resp.json().get('data')
                    
                    fornecedor_nome = p.get('fornecedor', {}).get('nome', '').upper()
                    
                    # Filtro de Blacklist para Atendidos
                    if sit_valor == VALOR_SIT_ATENDIDO and any(b in fornecedor_nome for b in BLACKLIST_FORNECEDORES):
                        continue

                    # Matemática de Rateio
                    val_frete = p.get('transporte', {}).get('frete', 0)
                    val_desc = p.get('desconto', {}).get('valor', 0)
                    val_ipi_total = p.get('tributacao', {}).get('totalIPI', 0)
                    
                    itens = p.get('itens', [])
                    soma_prod = sum([i['valor'] * i['quantidade'] for i in itens]) or 1

                    for item in itens:
                        sku = item.get('produto', {}).get('codigo', '').strip()
                        if not sku: continue

                        qtd = item['quantidade']
                        v_unit = item['valor']
                        peso = (v_unit * qtd) / soma_prod
                        
                        # Rateio proporcional
                        buffer.append({
                            "id_pedido": p['id'],
                            "sku": sku,
                            "data_pedido": p['data'],
                            "data_prevista": p.get('dataPrevista'),
                            "quantidade": qtd,
                            "preco_unitario": v_unit,
                            "desconto": (val_desc * peso) / qtd if qtd > 0 else 0,
                            "frete": (val_frete * peso) / qtd if qtd > 0 else 0,
                            "ipi": (val_ipi_total * peso) / qtd if qtd > 0 else 0,
                            "fornecedor": fornecedor_nome,
                            "loja": loja_nome,
                            "situacao": "Atendido" if sit_valor == VALOR_SIT_ATENDIDO else "Em Andamento"
                        })

                except Exception as e_det:
                    print(f"   ⚠️ Erro pedido {p_resumo.get('id')}: {e_det}")

            if buffer:
                salvar_no_supabase(buffer)

        print(f"   ✅ Sincronização de {loja_nome} concluída.")

    except Exception as e:
        print(f"❌ Erro crítico na loja {loja_nome}: {e}")

if __name__ == "__main__":
    for loja in ["PORTFIO", "PORTCASA"]:
        processar_pedidos_compra(loja)