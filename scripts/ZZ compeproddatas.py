import requests
import time
from datetime import datetime
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES DE DATA ---
# Ajuste o período conforme necessário
DATA_INICIO = "2026-02-12 00:00:00"
DATA_FIM = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# Cache local para evitar consultas repetidas de categoria
cache_categorias = set()

def garantir_categoria(service, id_categoria):
    """Verifica se categoria existe no banco, se não, busca no Bling e cria."""
    if not id_categoria or id_categoria in cache_categorias: return
    
    # Verifica banco
    url_check = f"{SUPABASE_URL}/rest/v1/categorias?id=eq.{id_categoria}&select=id"
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    try:
        if requests.get(url_check, headers=headers).json():
            cache_categorias.add(id_categoria)
            return
        
        # Busca no Bling
        token = service.get_valid_token()
        r_bling = requests.get(f"https://www.bling.com.br/Api/v3/categorias/produtos/{id_categoria}", headers={"Authorization": f"Bearer {token}"})
        if r_bling.status_code == 200:
            cat_data = r_bling.json().get('data', {})
            nova_cat = {
                "id": cat_data.get('id'),
                "descricao": cat_data.get('descricao', 'Nova Categoria'),
                "id_categoria_pai": cat_data.get('categoriaPai', {}).get('id') 
            }
            # Recursividade para pai da categoria
            if nova_cat['id_categoria_pai']: garantir_categoria(service, nova_cat['id_categoria_pai'])
            
            # Salva
            requests.post(f"{SUPABASE_URL}/rest/v1/categorias", headers=headers, json=nova_cat, params={"on_conflict": "id"})
            print(f"   ✅ Categoria {nova_cat['descricao']} cadastrada.")
            cache_categorias.add(id_categoria)
    except: pass

def salvar_lote_supabase(lista_produtos):
    if not lista_produtos: return
    # Remove duplicatas de SKU no mesmo lote
    lote_final = list({p['sku']: p for p in lista_produtos}.values())
    
    url = f"{SUPABASE_URL}/rest/v1/produtos"
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"}
    
    r = requests.post(url, headers=headers, json=lote_final)
    if r.status_code not in [200, 201, 204]: print(f"   ❌ Erro Banco (Produtos): {r.text}")
    else: print(f"   💾 Lote de {len(lote_final)} produtos salvo.")

def salvar_composicoes(lote):
    if not lote: return
    # Remove duplicatas de pares pai-filho
    lote_final = list({(c['sku_pai'], c['sku_filho']): c for c in lote}.values())
    
    url = f"{SUPABASE_URL}/rest/v1/composicoes"
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"}
    
    r = requests.post(url, headers=headers, json=lote_final)
    if r.status_code not in [200, 201, 204]: print(f"   ❌ Erro Banco (Composições): {r.text}")
    else: print(f"   🔗 Lote de {len(lote_final)} composições salvo.")

def obter_mapa_id_sku_completo(coluna_id):
    """
    CORREÇÃO: Step de 1000 para respeitar limite do Supabase e carregar TUDO.
    """
    print(f"🔍 Carregando mapa de IDs ({coluna_id})...")
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Range-Unit": "items"}
    mapa = {}
    offset = 0
    step = 1000 # Limite padrão do Supabase/PostgREST
    
    while True:
        headers["Range"] = f"{offset}-{offset + step - 1}"
        r = requests.get(f"{SUPABASE_URL}/rest/v1/produtos?select=sku,{coluna_id}&{coluna_id}=not.is.null", headers=headers)
        
        if r.status_code != 200: 
            print(f"❌ Erro carregando mapa: {r.status_code}")
            break
            
        dados = r.json()
        if not dados: break
        
        for item in dados: mapa[str(item[coluna_id])] = item['sku']
        
        print(f"   ... carregados {len(dados)} (Total: {len(mapa)})")
        
        if len(dados) < step: break # Se veio menos que 1000, acabou
        offset += step
        
    print(f"✅ Mapa carregado: {len(mapa)} SKUs na memória.")
    return mapa

def processar_produto_json(p, nome_loja):
    sku = p.get("codigo")
    if not sku: return None
    custo = p.get("precoCusto", 0)
    if not custo or float(custo) == 0:
        custo = p.get("fornecedor", {}).get("precoCusto", 0) or p.get("fornecedor", {}).get("precoCompra", 0)
    
    cat_id = p.get("categoria", {}).get("id")
    if cat_id == 0: cat_id = None

    item = {
        "sku": sku, "nome": p.get("nome", ""), "custo_fixo": custo,
        "preco_venda_padrao": p.get("preco", 0), "situacao": p.get("situacao", "A"),
        "tipo": p.get("tipo", "P"), "formato": p.get("formato", "S"),
        "gtin": p.get("gtin"), "gtin_embalagem": p.get("gtinEmbalagem"),
        "fornecedor": p.get("fornecedor", {}).get("contato", {}).get("nome"),
        "categoria_id": cat_id
    }
    if nome_loja == "PORTCASA": item["id_bling_portcasa"] = p.get("id")
    elif nome_loja == "PORTFIO": item["id_bling_portfio"] = p.get("id")
    elif nome_loja == "CASA_MODELO": item["id_bling_casamodelo"] = p.get("id")
    return item

def carregar_produtos_por_data(nome_loja):
    print(f"\n🚀 CARGA PRODUTOS ({nome_loja}): {DATA_INICIO} a {DATA_FIM}")
    service = BlingService(nome_loja)
    buffer = []
    
    params = {"dataInclusaoInicial": DATA_INICIO, "dataInclusaoFinal": DATA_FIM, "criterio": 5}
    
    for lote in service.get_all_pages("/produtos", params=params):
        token = service.get_valid_token()
        for p_resumo in lote:
            id_prod = p_resumo.get("id")
            if not id_prod: continue
            try:
                time.sleep(0.35)
                r = requests.get(f"https://www.bling.com.br/Api/v3/produtos/{id_prod}", headers={"Authorization": f"Bearer {token}"})
                if r.status_code != 200: continue
                p = r.json().get('data', {})

                # Garante categoria do pai
                if p.get("categoria", {}).get("id"): garantir_categoria(service, p["categoria"]["id"])

                item = processar_produto_json(p, nome_loja)
                if item: 
                    buffer.append(item)
                    print(f"   📦 {item['sku']}")

                # Variações (garante que filhos sejam salvos também)
                for v in p.get("variacoes", []):
                    if v.get("categoria", {}).get("id"): garantir_categoria(service, v["categoria"]["id"])
                    v_item = processar_produto_json(v, nome_loja)
                    if v_item:
                        if not v_item["custo_fixo"]: v_item["custo_fixo"] = item["custo_fixo"]
                        if not v_item["fornecedor"]: v_item["fornecedor"] = item["fornecedor"]
                        if not v_item["categoria_id"]: v_item["categoria_id"] = item["categoria_id"]
                        buffer.append(v_item)

            except Exception as e: print(f"❌ Erro SKU {id_prod}: {e}")
            
            if len(buffer) >= 50:
                salvar_lote_supabase(buffer)
                buffer = []
                
    if buffer: salvar_lote_supabase(buffer)

def carregar_kits_por_data(nome_loja, coluna_id):
    print(f"\n🧩 CARGA COMPOSIÇÕES ({nome_loja})")
    # Recarrega o mapa completo agora que salvamos os produtos
    mapa = obter_mapa_id_sku_completo(coluna_id)
    
    service = BlingService(nome_loja)
    buffer = []
    
    params = {"tipo": "E", "dataInclusaoInicial": DATA_INICIO, "dataInclusaoFinal": DATA_FIM, "criterio": 5}
    
    for lote in service.get_all_pages("/produtos", params=params):
        token = service.get_valid_token()
        for prod in lote:
            id_pai = str(prod.get("id"))
            sku_pai = mapa.get(id_pai)
            
            if not sku_pai: 
                print(f"   ⚠️ PAI {prod.get('codigo')} não encontrado no banco (ID {id_pai}).")
                continue

            try:
                time.sleep(0.2)
                r = requests.get(f"https://www.bling.com.br/Api/v3/produtos/estruturas/{id_pai}", headers={"Authorization": f"Bearer {token}"})
                if r.status_code == 200:
                    for comp in r.json().get('data', {}).get('componentes', []):
                        id_filho = str(comp.get("produto", {}).get("id"))
                        sku_filho = mapa.get(id_filho)
                        
                        if sku_filho:
                            buffer.append({
                                "sku_pai": sku_pai, 
                                "sku_filho": sku_filho, 
                                "quantidade_filho": comp.get("quantidade", 1)
                            })
                            print(f"   🔗 {sku_pai} -> {sku_filho}")
                        else:
                            print(f"   🚫 Filho ID {id_filho} não encontrado para o pai {sku_pai}")
            except Exception as e: print(f"❌ Erro Kit {id_pai}: {e}")

            if len(buffer) >= 50:
                salvar_composicoes(buffer)
                buffer = []
                
    if buffer: salvar_composicoes(buffer)

if __name__ == "__main__":
    LOJA = "PORTFIO"
    COLUNA_ID = "id_bling_portfio"
    
    carregar_produtos_por_data(LOJA)
    carregar_kits_por_data(LOJA, COLUNA_ID)