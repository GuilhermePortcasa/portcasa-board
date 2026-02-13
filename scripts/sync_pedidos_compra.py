import requests
import time
from datetime import datetime
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES ---
VALOR_SIT_EM_ANDAMENTO = 3
VALOR_SIT_ATENDIDO = 1

BLACKLIST_FORNECEDORES = [
    "COM DE FIOS E TECIDOS PORTFIO", "COMERCIO DE FIOS E TECIDOS PORTFIO LTDA",
    "PORTCASA ON LINE LTDA", "SONO E CONFORTO COMERCIO LTDA",
    "MULTIART COMERCIO IMPORTACAO LTDA", "MBF INDUSTRIA DE TECIDOS E CONFECCOES LTDA EPP"
]

# Cache para evitar consultas repetitivas de nome de fornecedor
cache_fornecedores = {}

def limpar_data(data_str):
    """Converte datas inválidas do Bling para None (NULL no banco)"""
    if not data_str or data_str == "0000-00-00":
        return None
    return data_str

def get_nome_fornecedor(service, id_fornecedor):
    if not id_fornecedor: return "FORNECEDOR NAO INFORMADO"
    if id_fornecedor in cache_fornecedores:
        return cache_fornecedores[id_fornecedor]
    
    try:
        token = service.get_valid_token()
        r = requests.get(f"https://www.bling.com.br/Api/v3/contatos/{id_fornecedor}", 
                         headers={"Authorization": f"Bearer {token}"})
        if r.status_code == 200:
            nome = r.json().get('data', {}).get('nome', 'FORNECEDOR DESCONHECIDO')
            cache_fornecedores[id_fornecedor] = nome
            return nome
    except:
        pass
    return "FORNECEDOR ID " + str(id_fornecedor)

def salvar_no_supabase(lote):
    if not lote: return
    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", 
        "Content-Type": "application/json"
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/compras_pedidos", headers=headers, json=lote)
    if r.status_code not in [200, 201, 204]:
        print(f"      ❌ Erro Supabase: {r.text}")

def processar_pedidos_compra(loja_nome):
    print(f"\n🚀 Iniciando Sincronização TOTAL: {loja_nome}")
    service = BlingService(loja_nome)
    
    params = {"limite": 100}

    try:
        for lote in service.get_all_pages("/pedidos/compras", params=params):
            buffer = []
            for p_resumo in lote:
                sit_valor = p_resumo.get('situacao', {}).get('valor')
                
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
                    
                    id_forn = p.get('fornecedor', {}).get('id')
                    fornecedor_nome = get_nome_fornecedor(service, id_forn).upper()
                    
                    if sit_valor == VALOR_SIT_ATENDIDO and any(b in fornecedor_nome for b in BLACKLIST_FORNECEDORES):
                        continue

                    val_frete = p.get('transporte', {}).get('frete', 0)
                    val_ipi_total = p.get('tributacao', {}).get('totalIPI', 0)
                    
                    desc_info = p.get('desconto', {})
                    val_desc_total = desc_info.get('valor', 0)
                    if desc_info.get('unidade') == 'PERCENTUAL':
                        val_desc_total = (p.get('totalProdutos', 0) * val_desc_total) / 100

                    itens = p.get('itens', [])
                    soma_prod_bruta = sum([i['valor'] * i['quantidade'] for i in itens]) or 1

                    for item in itens:
                        sku = item.get('produto', {}).get('codigo', '').strip()
                        if not sku: continue

                        qtd = item['quantidade']
                        v_unit = item['valor']
                        peso_relativo = (v_unit * qtd) / soma_prod_bruta
                        
                        frete_un = (val_frete * peso_relativo) / qtd if qtd > 0 else 0
                        desc_un = (val_desc_total * peso_relativo) / qtd if qtd > 0 else 0
                        ipi_un = (val_ipi_total * peso_relativo) / qtd if qtd > 0 else 0

                        # --- CORREÇÃO APLICADA AQUI ---
                        data_pedido = limpar_data(p.get('data'))
                        data_prevista = limpar_data(p.get('dataPrevista'))

                        buffer.append({
                            "id_pedido": p['id'],
                            "sku": sku,
                            "data_pedido": data_pedido,
                            "data_prevista": data_prevista,
                            "quantidade": qtd,
                            "preco_unitario": v_unit,
                            "desconto": desc_un,
                            "frete": frete_un,
                            "ipi": ipi_un,
                            "fornecedor": fornecedor_nome,
                            "loja": loja_nome,
                            "situacao": "Atendido" if sit_valor == VALOR_SIT_ATENDIDO else "Em Andamento"
                        })
                    
                    print(f"   📦 Pedido {p['numero']} ({fornecedor_nome}) processado.")

                except Exception as e_det:
                    print(f"   ⚠️ Erro pedido {p_resumo.get('id')}: {e_det}")

            if buffer:
                salvar_no_supabase(buffer)

        print(f"   ✅ Sincronização de {loja_nome} concluída com sucesso.")

    except Exception as e:
        print(f"❌ Erro crítico na loja {loja_nome}: {e}")

if __name__ == "__main__":
    for loja in ["PORTFIO", "PORTCASA"]:
        processar_pedidos_compra(loja)