import requests
import time
from datetime import datetime
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES ---
DATA_INICIO = "2025-08-07"

CONFIG_LOJAS = [
    {
        "nome": "PORTFIO",
        "id_loja_filtro": 204457689,
        "naturezas": [7255067378, 7314982489, 7256147975],
        "ignorar_situacoes": [1, 2, 3, 8, 10],
        "exigir_pendente": False,
        "serie_especifica": None,
        "origem_destino": "SITE"
    },
    {
        "nome": "CASA_MODELO",
        "id_loja_filtro": None,
        "naturezas": [15108547531, 15108547533],
        "ignorar_situacoes": [1, 2, 3, 8, 10],
        "exigir_pendente": False,
        "serie_especifica": "1",
        "origem_destino": "CASA_MODELO"
    },
    {
        "nome": "PORTCASA",
        "id_loja_filtro": None,
        "naturezas": [15108451958],
        "ignorar_situacoes": [],
        "exigir_pendente": True,
        "serie_especifica": "888",
        "origem_destino": "LOJA"
    }
]

def carregar_ids_processados():
    """Busca no Supabase IDs de devolução que JÁ estão corretos (valor > 0)"""
    print("🔎 Verificando devoluções já processadas no Supabase...")
    ids_ok = set()
    
    # Paginação do Supabase para pegar tudo (limite de 1000 por vez)
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/devolucoes?select=id,valor_estorno&valor_estorno=gt.0&range={offset}-{offset+999}"
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        resp = requests.get(url, headers=headers)
        
        if resp.status_code != 200:
            print(f"⚠️ Erro ao buscar cache Supabase: {resp.text}")
            break
            
        dados = resp.json()
        if not dados: break
        
        for d in dados:
            ids_ok.add(d['id'])
            
        offset += 1000
        if len(dados) < 1000: break
        
    print(f"✅ {len(ids_ok)} devoluções já estão corretas e serão puladas.")
    return ids_ok

def enviar_supabase(lote):
    if not lote: return
    
    itens_unicos = {}
    for item in lote:
        chave = (item['id'], item['sku'])
        if chave in itens_unicos:
            itens_unicos[chave]['quantidade'] += item['quantidade']
            itens_unicos[chave]['valor_estorno'] += item['valor_estorno']
        else:
            itens_unicos[chave] = item.copy()
            
    payload = list(itens_unicos.values())
    headers = {
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", "Content-Type": "application/json"
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/devolucoes", headers=headers, json=payload)
    if r.status_code not in [200, 201, 204]:
        print(f"      ❌ Erro Supabase: {r.text}")
    else:
        print(f"      ✅ Lote de {len(payload)} itens atualizado.")

def calcular_valor_liquido(nf, itens):
    val_frete = nf.get('valorFrete', 0)
    val_outras = nf.get('outrasDespesas', 0)
    val_nota = nf.get('valorNota', 0)
    
    soma_produtos = sum([(i.get('valor') or i.get('valorUnitario') or 0) * i.get('quantidade', 0) for i in itens])
    if soma_produtos == 0: soma_produtos = 1

    total_esperado = soma_produtos + val_frete + val_outras
    desconto_total = max(0, total_esperado - val_nota)
    
    resultados = []
    for item in itens:
        preco = item.get('valor') or item.get('valorUnitario') or 0
        qtd = item.get('quantidade', 0)
        bruto = preco * qtd
        peso = bruto / soma_produtos
        liquido = bruto + (val_frete * peso) - (desconto_total * peso)
        
        resultados.append({
            "sku": item['codigo'],
            "quantidade": qtd,
            "valor_liquido": liquido
        })
    return resultados

def processar_loja(config, ids_ignorados):
    nome = config['nome']
    print(f"\n🚀 Loja: {nome}")
    service = BlingService(nome)
    
    params = {
        "dataEmissaoInicial": f"{DATA_INICIO} 00:00:00",
        "dataEmissaoFinal": datetime.now().strftime("%Y-%m-%d 23:59:59"),
        "tipo": 0, # Entrada
        "limite": 100
    }
    
    try:
        # Aqui está a mágica: get_all_pages já lida com paginação e rate limit
        for lote in service.get_all_pages("/nfe", params=params):
            buffer_envio = []
            
            for nf_resumo in lote:
                nf_id = nf_resumo['id']

                # 1. OTIMIZAÇÃO SUPREME: Já temos isso salvo e correto?
                if nf_id in ids_ignorados: 
                    continue 

                # 2. OTIMIZAÇÃO BLING: Filtra Natureza ANTES de abrir detalhe
                # O resumo da lista já traz a natureza. Se não for de devolução, PULA.
                nat_id_resumo = nf_resumo.get('naturezaOperacao', {}).get('id')
                if nat_id_resumo not in config['naturezas']:
                    continue

                # Filtro de Situação Rápido
                sit = nf_resumo.get('situacao')
                if config['exigir_pendente']:
                    if sit != 1: continue 
                else:
                    if sit in config['ignorar_situacoes']: continue

                # Se passou pelos filtros rápidos, aí sim gastamos tempo buscando o detalhe
                try:
                    time.sleep(0.04)
                    url_det = f"https://www.bling.com.br/Api/v3/nfe/{nf_id}"
                    token = service.get_valid_token()
                    resp = requests.get(url_det, headers={"Authorization": f"Bearer {token}"})
                    
                    if resp.status_code == 401:
                        try: token = service._refresh_token(service._get_tokens_db()['refresh_token'])
                        except: token = service.get_valid_token()
                        resp = requests.get(url_det, headers={"Authorization": f"Bearer {token}"})

                    if resp.status_code != 200: continue
                    nf = resp.json().get('data')
                    if not nf: continue

                    # Filtros Finais (Loja e Série)
                    if config['id_loja_filtro'] and nf.get('loja', {}).get('id') != config['id_loja_filtro']: continue
                    if config['serie_especifica'] and str(nf.get('serie')) != config['serie_especifica']: continue

                    itens = nf.get('itens', [])
                    if not itens: continue
                    
                    itens_calculados = calcular_valor_liquido(nf, itens)
                    
                    for item_calc in itens_calculados:
                        buffer_envio.append({
                            "id": nf['id'],
                            "sku": item_calc['sku'],
                            "data_devolucao": nf['dataEmissao'][:10],
                            "origem": config['origem_destino'],
                            "loja": nome,
                            "quantidade": item_calc['quantidade'],
                            "valor_estorno": item_calc['valor_liquido']
                        })
                        
                except Exception as e:
                    print(f"   ⚠️ Erro NF {nf_id}: {e}")
            
            if buffer_envio:
                enviar_supabase(buffer_envio)

    except Exception as e:
        print(f"❌ Erro crítico em {nome}: {e}")

if __name__ == "__main__":
    # Carrega IDs que já estão salvos e com valor > 0 para não refazer trabalho
    ids_ja_processados = carregar_ids_processados()
    
    for loja in CONFIG_LOJAS:
        processar_loja(loja, ids_ja_processados)