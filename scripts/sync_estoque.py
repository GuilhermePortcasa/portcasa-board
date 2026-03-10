import os
import requests
import time
from datetime import datetime
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- DEPOSITOS BASEADOS NO WEBHOOK ---
DEPOSITOS = {
    14887582360: "LOJA",
    6432743977: "SITE",
    14887265613: "FULL"
}

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Prefer": "resolution=merge-duplicates",
    "Content-Type": "application/json"
}

# Divide listas grandes em lotes menores
def chunker(seq, size):
    return (seq[pos:pos + size] for pos in range(0, len(seq), size))

def obter_produtos_ativos():
    print("📥 Buscando catálogo de produtos no Supabase...")
    produtos = []
    offset = 0
    limit = 5000
    
    while True:
        # ADICIONADO: A coluna 'nome' no select para poder filtrar os desativados
        url = f"{SUPABASE_URL}/rest/v1/produtos?select=sku,id_bling_portfio,id_bling_portcasa,formato,nome&limit={limit}&offset={offset}"
        r = requests.get(url, headers=HEADERS)
        if r.status_code != 200:
            print(f"❌ Erro ao buscar produtos: {r.text}")
            break
            
        lote = r.json()
        if not lote:
            break
            
        # FILTRO DUPLO: IGNORA KITS (E) E PRODUTOS QUE COMEÇAM COM '0 - '
        for p in lote:
            formato = str(p.get('formato')).upper() if p.get('formato') else 'S'
            nome = str(p.get('nome', '')).strip()
            
            if formato != 'E' and not nome.startswith('0 - '):
                produtos.append(p)
                
        offset += limit
        
    print(f"✅ {len(produtos)} produtos válidos (sem composições e ativos) encontrados.")
    return produtos

def salvar_estoque(lote):
    if not lote: return
    url = f"{SUPABASE_URL}/rest/v1/estoque"
    r = requests.post(url, headers=HEADERS, json=lote)
    if r.status_code not in [200, 201, 204]:
        print(f"   ❌ Erro ao salvar lote de estoque no Supabase: {r.text}")
    else:
        print(f"   ✅ Lote de {len(lote)} saldos de estoque sincronizado (Upsert).")

def processar_conta_bling(nome_loja, map_id_sku):
    ids_bling = list(map_id_sku.keys())
    if not ids_bling: return

    print(f"\n🚀 Sincronizando {len(ids_bling)} itens na conta: {nome_loja}")
    service = BlingService(nome_loja)
    buffer_estoque = []

    # O Bling aceita múltiplos IDs na URL. Lotes de 40 para evitar URLs gigantescas.
    for lote_ids in chunker(ids_bling, 40):
        max_retries = 3
        sucesso = False
        
        for tentativa in range(max_retries):
            time.sleep(0.35)
            token = service.get_valid_token()
            
            # Formata a query string: idsProdutos[]=1&idsProdutos[]=2...
            qs = "&".join([f"idsProdutos[]={id_b}" for id_b in lote_ids])
            url = f"https://www.bling.com.br/Api/v3/estoques/saldos?{qs}"
            
            r = requests.get(url, headers={"Authorization": f"Bearer {token}"})
            
            if r.status_code == 200:
                saldos = r.json().get('data', [])
                
                # 1. Indexa o que o Bling retornou (Caso o ID exista e tenha depósitos)
                estoques_retornados = {}
                for s in saldos:
                    id_retornado = s.get('produto', {}).get('id')
                    # Cria um dicionário interno mapeando: {id_deposito: quantidade}
                    estoques_retornados[id_retornado] = { dep.get('id'): dep.get('saldoFisico', 0) for dep in s.get('depositos', []) }
                
                # 2. Varre TODOS os IDs que pedimos neste lote (A mágica de zerar os perdidos)
                for id_req in lote_ids:
                    sku = map_id_sku.get(id_req)
                    if not sku: continue
                    
                    # Tenta pegar os depósitos que vieram do Bling para este ID. Se o ID sumiu da resposta, retorna {}
                    depositos_do_item = estoques_retornados.get(id_req, {})
                    
                    # Garante que as 3 linhas de estoque (LOJA, SITE e FULL) sejam enviadas ao Supabase
                    for id_dep_monitorado, nome_canal in DEPOSITOS.items():
                        # Se o depósito não veio no JSON (ou se o produto todo sumiu), a quantidade assume 0
                        qtd_final = depositos_do_item.get(id_dep_monitorado, 0)
                        
                        buffer_estoque.append({
                            "sku": sku,
                            "canal": nome_canal,
                            "quantidade": qtd_final,
                            "updated_at": datetime.now().isoformat()
                        })
                        
                sucesso = True
                break
            elif r.status_code == 429:
                espera = 2 ** tentativa
                print(f"   ⏳ Rate Limit (429). Aguardando {espera}s para retentar...")
                time.sleep(espera)
            else:
                print(f"   ⚠️ Erro na API do Bling {r.status_code}: {r.text}")
                break
        
        if not sucesso:
            print("   ❌ Falha ao buscar lote após retentativas.")
            
        # Descarrega buffer se estiver grande para não pesar a memória
        if len(buffer_estoque) >= 500:
            salvar_estoque(buffer_estoque)
            buffer_estoque = []

    # Salva o resto
    if buffer_estoque:
        salvar_estoque(buffer_estoque)

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Erro: Credenciais Supabase ausentes.")
        return

    produtos = obter_produtos_ativos()
    
    # Criamos os mapas de ID Bling -> SKU para saber de quem é o estoque
    map_portfio = {int(p['id_bling_portfio']): p['sku'] for p in produtos if p.get('id_bling_portfio')}
    map_portcasa = {int(p['id_bling_portcasa']): p['sku'] for p in produtos if p.get('id_bling_portcasa')}
    
    processar_conta_bling("PORTFIO", map_portfio)
    processar_conta_bling("PORTCASA", map_portcasa)
    
    print("\n🔄 Processo de Estoque finalizado. Atualizando View do Dashboard...")
    try:
        r = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/refresh_mview_dashboard", headers=HEADERS)
        if r.status_code in [200, 204]:
            print("✨ View do Dashboard recarregada com sucesso e pronta para uso!")
        else:
            print(f"⚠️ Aviso: Falha ao recarregar a View. ({r.text})")
    except Exception as e:
        print(f"⚠️ Erro ao acionar o gatilho da View: {e}")

if __name__ == "__main__":
    main()