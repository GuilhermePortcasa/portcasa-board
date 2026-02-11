import requests
import json
import time
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

def salvar_lote_supabase(lista_produtos):
    """Envia o lote para o Supabase (Upsert por SKU)"""
    if not lista_produtos: return

    url = f"{SUPABASE_URL}/rest/v1/produtos"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    
    r = requests.post(url, headers=headers, json=lista_produtos, params={"on_conflict": "sku"})
    
    if r.status_code not in [200, 201, 204]:
        print(f"   ❌ Erro ao salvar lote no banco: {r.text}")
    else:
        print(f"   💾 Lote de {len(lista_produtos)} produtos salvo/atualizado.")

def carregar_catalogo_detalhado(nome_loja, pagina_inicial=1):
    print(f"\n🚀 RETOMANDO CARGA: {nome_loja} (Iniciando na Pág {pagina_inicial})")
    service = BlingService(nome_loja)
    
    buffer_produtos = []
    total_loja = 0
    
    # Inicia o gerador a partir da página desejada
    for lote_resumo in service.get_all_pages("/produtos", params={"criterio": 5, "pagina": pagina_inicial}):
        
        token = service.get_valid_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        for p_resumo in lote_resumo:
            if p_resumo.get("situacao") == "E": continue # Pula excluídos
                
            id_produto = p_resumo.get("id")
            sku = p_resumo.get("codigo")
            if not id_produto or not sku: continue

            try:
                # Respeita o rate limit da API v3 (aprox 3 req/s)
                time.sleep(0.35) 
                
                r_det = requests.get(f"https://www.bling.com.br/Api/v3/produtos/{id_produto}", headers=headers)
                
                if r_det.status_code == 429:
                    print("\n⏳ Rate limit atingido. Aguardando 5s...")
                    time.sleep(5)
                    r_det = requests.get(f"https://www.bling.com.br/Api/v3/produtos/{id_produto}", headers=headers)
                
                if r_det.status_code != 200: continue
                    
                p = r_det.json().get('data', {})
                nome_prod = p.get("nome", "")

                # --- REGRA DE OURO: FILTRO PORTFIO ---
                if nome_loja == "PORTFIO":
                    # Só aceita se começar com "0 - " ou "1 - "
                    if not (nome_prod.startswith("0 - ") or nome_prod.startswith("1 - ")):
                        continue 
                # -------------------------------------
                
                # --- LÓGICA DE CUSTO INTELIGENTE ---
                custo_final = p.get("precoCusto", 0)
                if not custo_final or float(custo_final) == 0:
                    fornecedor_obj = p.get("fornecedor", {})
                    custo_final = fornecedor_obj.get("precoCusto", 0)
                    if not custo_final or float(custo_final) == 0:
                        custo_final = fornecedor_obj.get("precoCompra", 0)

                # Extração de campos extras
                nome_fornecedor = None
                if "fornecedor" in p and "contato" in p["fornecedor"]:
                    nome_fornecedor = p["fornecedor"]["contato"].get("nome")

                categoria_id = None
                if "categoria" in p:
                    categoria_id = p["categoria"].get("id")

                item = {
                    "sku": sku,
                    "nome": nome_prod,
                    "custo_fixo": custo_final,
                    "preco_venda_padrao": p.get("preco", 0),
                    "situacao": p.get("situacao", "A"),
                    "tipo": p.get("tipo", "P"),
                    "formato": p.get("formato", "S"),
                    "gtin": p.get("gtin"),
                    "gtin_embalagem": p.get("gtinEmbalagem"),
                    "fornecedor": nome_fornecedor,
                    "categoria_id": categoria_id
                }
                
                buffer_produtos.append(item)
                total_loja += 1
                
                print(f"\r   🛠️  Processando {nome_loja}: {sku} | Custo: R$ {custo_final} | Pág: {service.current_page}", end="")

                if len(buffer_produtos) >= 50:
                    print("") 
                    salvar_lote_supabase(buffer_produtos)
                    buffer_produtos = []
                    
            except Exception as e:
                print(f"\n   ❌ Erro no SKU {sku}: {e}")

    if buffer_produtos:
        print("")
        salvar_lote_supabase(buffer_produtos)

    print(f"\n🏁 Concluído {nome_loja}. Total desta sessão: {total_loja}")

if __name__ == "__main__":
    # 1. CONTINUA PORTCASA da página 24
    carregar_catalogo_detalhado("PORTCASA", pagina_inicial=55)
    
    # 2. PORTFIO começa do zero (página 1)
    carregar_catalogo_detalhado("PORTFIO", pagina_inicial=1)