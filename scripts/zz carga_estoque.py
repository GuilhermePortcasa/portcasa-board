import requests
import time
import math
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÃO DOS DEPÓSITOS ---
ID_DEP_PORTCASA_GERAL = 14887582360
ID_DEP_PORTFIO_GERAL = 6432743977
ID_DEP_PORTFIO_FULL = 14887265613

def carregar_dados_produtos_banco():
    """
    Busca SKUs, TIPO, NOME e IDs BLING de forma PAGINADA (trazendo tudo).
    Retorna uma lista de objetos completos.
    """
    print("🔍 Carregando mapa COMPLETO de produtos do Supabase...")
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Range-Unit": "items"
    }
    
    produtos_validos = []
    offset = 0
    step = 1000
    
    while True:
        headers["Range"] = f"{offset}-{offset + step - 1}"
        # Buscamos SKU, tipo, nome e os IDs de cada loja
        url = f"{SUPABASE_URL}/rest/v1/produtos?select=sku,tipo,nome,id_bling_portcasa,id_bling_portfio"
        
        try:
            r = requests.get(url, headers=headers)
            if r.status_code == 200:
                dados = r.json()
                if not dados: break 
                
                for p in dados:
                    # --- FILTRO DE OURO (REGRAS DE NEGÓCIO) ---
                    # 1. Ignora Tipo 'E' (Kits)
                    if p.get('tipo') == 'E': continue
                    # 2. Ignora nomes virtuais '0 - ' e '1 - ' (se houver regra de 1-)
                    nome = str(p.get('nome', ''))
                    if nome.startswith('0 - '): continue
                    
                    produtos_validos.append(p)
                
                print(f"   ... processados {len(dados)} registros (Válidos acumulados: {len(produtos_validos)})...")
                
                if len(dados) < step: break
                offset += step
            else:
                print(f"❌ Erro ao ler Supabase: {r.text}")
                break
        except Exception as e:
            print(f"❌ Erro de conexão: {e}")
            break
            
    print(f"✅ Total de produtos REAIS carregados: {len(produtos_validos)}")
    return produtos_validos

def salvar_estoque(lista):
    if not lista: return
    url = f"{SUPABASE_URL}/rest/v1/estoque"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    r = requests.post(url, headers=headers, json=lista, params={"on_conflict": "sku,canal"})
    if r.status_code not in [200, 201, 204]:
        print(f"   ❌ Erro ao salvar estoque: {r.text}")

def processar_estoque_por_lote(nome_loja, id_deposito, canal, lista_produtos):
    print(f"\n📦 CARGA DE ESTOQUE: {nome_loja} -> Canal {canal}")
    service = BlingService(nome_loja)
    
    # Identifica qual coluna de ID usar baseada na loja
    coluna_id = 'id_bling_portcasa' if nome_loja == 'PORTCASA' else 'id_bling_portfio'
    
    # Filtra produtos que têm ID para essa loja
    produtos_com_id = [p for p in lista_produtos if p.get(coluna_id)]
    
    print(f"   ℹ️  {len(produtos_com_id)} produtos possuem ID para {nome_loja} e serão consultados.")
    
    # Divide em lotes de 100 (limite do Bling para idsProdutos)
    tamanho_lote = 100
    total_chunks = math.ceil(len(produtos_com_id) / tamanho_lote)
    total_salvo = 0
    
    for i in range(total_chunks):
        chunk = produtos_com_id[i*tamanho_lote : (i+1)*tamanho_lote]
        
        # Cria lista de IDs para enviar na URL
        ids_para_busca = [int(p[coluna_id]) for p in chunk]
        
        # Mapeia ID -> SKU para facilitar depois
        mapa_id_sku = {int(p[coluna_id]): p['sku'] for p in chunk}
        
        params = {
            "idsDepositos[]": id_deposito,
            "idsProdutos[]": ids_para_busca
        }
        
        try:
            # Chama API de saldos
            # get_all_pages não é ideal aqui pois só teremos 1 página por lote de IDs
            # Vamos chamar direto o request
            token = service.get_valid_token()
            resp = requests.get(f"https://www.bling.com.br/Api/v3/estoques/saldos", 
                              headers={"Authorization": f"Bearer {token}"}, 
                              params=params)
            
            if resp.status_code == 429:
                print("⏳ Rate Limit. Aguardando 3s...")
                time.sleep(3)
                # Tenta de novo
                resp = requests.get(f"https://www.bling.com.br/Api/v3/estoques/saldos", 
                              headers={"Authorization": f"Bearer {token}"}, 
                              params=params)

            dados = resp.json()
            itens = dados.get('data', [])
            
            buffer_db = []
            
            # Se a API retornou dados, processamos
            if itens:
                for item in itens:
                    id_retornado = item.get('produto', {}).get('id')
                    sku = mapa_id_sku.get(id_retornado)
                    
                    if not sku: continue
                    
                    saldo = 0
                    for dep in item.get('depositos', []):
                        if str(dep.get('id')) == str(id_deposito):
                            saldo = dep.get('saldoFisico', 0)
                            break
                    
                    buffer_db.append({
                        "sku": sku,
                        "canal": canal,
                        "quantidade": saldo,
                        "updated_at": time.strftime('%Y-%m-%dT%H:%M:%S%z')
                    })
            
            # Importante: Se o produto não retornou na API, pode ser que o estoque seja 0 ou não exista vínculo no depósito.
            # Mas na API de saldos, geralmente só retorna o que pediu.
            
            if buffer_db:
                salvar_estoque(buffer_db)
                total_salvo += len(buffer_db)
                print(f"\r   ✅ Processado lote {i+1}/{total_chunks} (Total salvo: {total_salvo})", end="")
            
            time.sleep(0.2) # Respeitar API
            
        except Exception as e:
            print(f"\n   ❌ Erro no lote {i}: {e}")

    print(f"\n🏁 Fim {canal}. Total processado: {total_salvo}")

if __name__ == "__main__":
    # 1. Carrega todos os produtos válidos do banco
    lista_produtos = carregar_dados_produtos_banco()
    
    if lista_produtos:
        # 2. Roda as cargas por lote de IDs
        processar_estoque_por_lote("PORTCASA", ID_DEP_PORTCASA_GERAL, "LOJA", lista_produtos)
        processar_estoque_por_lote("PORTFIO", ID_DEP_PORTFIO_GERAL, "SITE", lista_produtos)
        processar_estoque_por_lote("PORTFIO", ID_DEP_PORTFIO_FULL, "FULL", lista_produtos)