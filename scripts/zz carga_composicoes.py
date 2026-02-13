import requests
import time
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

def obter_mapa_id_sku_completo(coluna_id):
    """
    Busca no Supabase o mapa ID -> SKU para a loja específica.
    PAGINADO para garantir que traz TUDO, não só os primeiros 1000.
    """
    print(f"🔍 Carregando mapa COMPLETO de IDs ({coluna_id})...")
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Range-Unit": "items"
    }
    
    mapa_completo = {}
    offset = 0
    step = 1000 # Limite padrão do Supabase
    
    while True:
        # Define o range: 0-999, 1000-1999, etc.
        headers["Range"] = f"{offset}-{offset + step - 1}"
        
        url = f"{SUPABASE_URL}/rest/v1/produtos?select=sku,{coluna_id}&{coluna_id}=not.is.null"
        
        try:
            r = requests.get(url, headers=headers)
            if r.status_code == 200:
                dados = r.json()
                if not dados:
                    break # Acabaram os dados
                
                # Adiciona ao dicionário principal
                for item in dados:
                    mapa_completo[str(item[coluna_id])] = item['sku']
                
                print(f"   ... carregados {len(dados)} itens (Total: {len(mapa_completo)})...")
                
                if len(dados) < step:
                    break # Última página era menor que o limite
                    
                offset += step
            else:
                print(f"❌ Erro ao buscar dados do banco: {r.text}")
                break
        except Exception as e:
            print(f"❌ Erro de conexão: {e}")
            break
            
    print(f"✅ Mapa finalizado: {len(mapa_completo)} SKUs carregados na memória.")
    return mapa_completo

def salvar_composicoes(lote):
    if not lote: return
    url = f"{SUPABASE_URL}/rest/v1/composicoes"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    r = requests.post(url, headers=headers, json=lote)
    if r.status_code not in [200, 201, 204]:
        print(f"   ❌ Erro ao salvar composições: {r.text}")

def processar_kits_loja(nome_loja, coluna_id):
    print(f"\n🧩 PROCESSANDO KITS: {nome_loja}")
    
    # AGORA USA A FUNÇÃO PAGINADA
    mapa = obter_mapa_id_sku_completo(coluna_id)
    
    if not mapa:
        print(f"🛑 Mapa de IDs vazio para {nome_loja}. Verifique se o mapear_ids_lojas.py rodou.")
        return

    service = BlingService(nome_loja)
    token = service.get_valid_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    buffer = []
    total_vinc = 0

    print(f"   📥 Buscando lista de produtos Tipo 'E' (Kits)...")
    
    # criterior=5 (todos) e tipo='E' (estruturas)
    for lote_produtos in service.get_all_pages("/produtos", params={'tipo': 'E', 'criterio': 5}):
        
        for prod in lote_produtos:
            id_pai = str(prod.get("id"))
            sku_pai = mapa.get(id_pai)
            
            # Se não achou o pai no mapa, tenta imprimir pra debug
            if not sku_pai:
                # print(f"⚠️ Pai não encontrado no banco: ID {id_pai} - {prod.get('nome')}")
                continue

            try:
                # Rate limit preventivo
                time.sleep(0.2)
                
                url_est = f"https://www.bling.com.br/Api/v3/produtos/estruturas/{id_pai}"
                r_est = requests.get(url_est, headers=headers)
                
                if r_est.status_code == 429:
                    print("   ⏳ Rate Limit. Aguardando...")
                    time.sleep(3)
                    r_est = requests.get(url_est, headers=headers)
                
                if r_est.status_code == 200:
                    data_est = r_est.json().get('data', {})
                    componentes = data_est.get('componentes', [])
                    
                    for comp in componentes:
                        id_filho = str(comp.get("produto", {}).get("id"))
                        sku_filho = mapa.get(id_filho)
                        
                        if sku_filho:
                            buffer.append({
                                "sku_pai": sku_pai,
                                "sku_filho": sku_filho,
                                "quantidade_filho": comp.get("quantidade", 1)
                            })
                            total_vinc += 1
                        # else:
                        #     print(f"⚠️ Filho ID {id_filho} não encontrado no banco (Pai: {sku_pai})")
                            
            except Exception as e:
                print(f"   ❌ Erro ao buscar estrutura: {e}")

            if len(buffer) >= 50:
                salvar_composicoes(buffer)
                buffer = []
                print(f"   🔗 {total_vinc} vínculos encontrados...")
                
                token = service.get_valid_token()
                headers = {"Authorization": f"Bearer {token}"}

    if buffer:
        salvar_composicoes(buffer)
    
    print(f"🏁 Concluído {nome_loja}. Total de vínculos criados: {total_vinc}")

if __name__ == "__main__":
    # 1. PortFio
    processar_kits_loja("PORTFIO", "id_bling_portfio")
    
    # 2. Casa Modelo
    processar_kits_loja("CASA_MODELO", "id_bling_casamodelo")