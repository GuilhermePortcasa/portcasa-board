import requests
import json
import time
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÃO DOS DEPÓSITOS (IDs recuperados do Diagnóstico) ---
ID_DEP_PORTCASA_GERAL = 14887582360
ID_DEP_PORTFIO_GERAL = 6432743977
ID_DEP_PORTFIO_FULL = 14887265613

def salvar_lote_estoque(lista_estoque):
    """Envia lote de estoque para o Supabase"""
    if not lista_estoque: return
    
    url = f"{SUPABASE_URL}/rest/v1/estoque"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    
    # Upsert: Se bater SKU + Canal, atualiza a quantidade
    r = requests.post(url, headers=headers, json=lista_estoque, params={"on_conflict": "sku,canal"})
    
    if r.status_code not in [200, 201, 204]:
        # Erro 23503 (Foreign Key Violation) acontece se o produto não existir na tabela produtos
        if "23503" in r.text:
            print("   ⚠️ Aviso: Alguns SKUs não existem na tabela de produtos (foram ignorados).")
        else:
            print(f"   ❌ Erro ao salvar estoque: {r.text}")

def carregar_estoque(nome_loja, id_deposito, nome_canal_destino):
    print(f"\n🏭 INICIANDO CARGA ESTOQUE: {nome_loja}")
    print(f"   Depósito ID: {id_deposito} -> Canal Destino: {nome_canal_destino}")
    
    service = BlingService(nome_loja)
    
    total_processado = 0
    buffer = []
    
    # Filtra apenas pelo depósito desejado
    params = {
        "idsDepositos[]": id_deposito,
        "filtroSaldoEstoque": 1 # Opcional: 1 = Apenas saldo positivo (economiza requisições se quiser)
                                # Se quiser atualizar zerados também, remova essa linha.
    }
    
    # O endpoint /estoques/saldos lista todos os produtos daquele depósito
    for lote in service.get_all_pages("/estoques/saldos", params=params):
        
        for item in lote:
            produto = item.get("produto", {})
            sku = produto.get("codigo")
            nome = produto.get("nome", "") # Algumas rotas de estoque trazem o nome

            if not sku: continue

            # REGRA: Se o nome começar com "0 - ", ignoramos o estoque
            if nome.startswith("0 - "):
                continue
            
            # Procura o saldo específico deste depósito na lista de depósitos retornada
            lista_depositos = item.get("depositos", [])
            saldo = 0
            
            for dep in lista_depositos:
                if str(dep.get("id")) == str(id_deposito):
                    saldo = dep.get("saldoFisico", 0)
                    break
            
            # Monta o objeto para o Supabase
            registro = {
                "sku": sku,
                "canal": nome_canal_destino,
                "quantidade": saldo,
                "updated_at": time.strftime('%Y-%m-%dT%H:%M:%S%z') # Data atual ISO
            }
            
            buffer.append(registro)
            total_processado += 1
            
            if len(buffer) >= 200:
                print(f"\r   📦 Processados: {total_processado}...", end="")
                salvar_lote_estoque(buffer)
                buffer = []
    
    # Salva o resto
    if buffer:
        salvar_lote_estoque(buffer)
        
    print(f"\n🏁 Fim da carga {nome_canal_destino}. Total: {total_processado}")

if __name__ == "__main__":
    # 1. PortCasa Geral -> Canal 'LOJA'
    carregar_estoque("PORTCASA", ID_DEP_PORTCASA_GERAL, "LOJA")
    
    # 2. PortFio Geral -> Canal 'SITE'
    carregar_estoque("PORTFIO", ID_DEP_PORTFIO_GERAL, "SITE")
    
    # 3. PortFio Full -> Canal 'FULL'
    carregar_estoque("PORTFIO", ID_DEP_PORTFIO_FULL, "FULL")