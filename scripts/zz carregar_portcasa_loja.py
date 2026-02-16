import requests
import time
from datetime import datetime
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES ---
ID_SIT_ATENDIDO = 9
LOJA_NOME = "PORTCASA"
ORIGEM_DESTINO = "LOJA"

# Datas Fixas para o resgate
DATA_INICIO = "2025-11-01"
DATA_FIM = "2025-11-30"

def salvar_pedidos(lote):
    if not lote: return

    # Agrupa itens duplicados (ID + SKU)
    itens_unicos = {}
    for item in lote:
        chave = (item['id'], item['sku'])
        if chave in itens_unicos:
            itens_unicos[chave]['quantidade'] += item['quantidade']
        else:
            itens_unicos[chave] = item.copy()
            
    lote_limpo = list(itens_unicos.values())

    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", 
        "Content-Type": "application/json"
    }
    
    try:
        r = requests.post(f"{SUPABASE_URL}/rest/v1/pedidos_venda", headers=headers, json=lote_limpo)
        if r.status_code not in [200, 201, 204]:
            print(f"   ❌ Erro Supabase: {r.text}")
        else:
            print(f"   ✅ {len(lote_limpo)} pedidos 'LOJA' salvos com sucesso.")
    except Exception as e:
        print(f"   ❌ Erro de conexão com Supabase: {e}")

def extrair_dezembro_loja():
    print(f"📦 Iniciando Extração LOJA - Período: {DATA_INICIO} a {DATA_FIM}")
    service = BlingService(LOJA_NOME)
    
    pagina_atual = 1
    tem_dados = True

    while tem_dados:
        try:
            print(f"📥 Baixando Pág {pagina_atual} (Novembro/25)...")
            
            params = {
                "dataInicial": DATA_INICIO, 
                "dataFinal": DATA_FIM, 
                "idsSituacoes[]": ID_SIT_ATENDIDO, 
                "limite": 100,
                "pagina": pagina_atual
            }
            
            resp = requests.get(
                "https://www.bling.com.br/Api/v3/pedidos/vendas",
                headers={"Authorization": f"Bearer {service.get_valid_token()}"},
                params=params
            )
            
            if resp.status_code != 200:
                print(f"❌ Erro API Bling Pág {pagina_atual}: {resp.status_code} - {resp.text}")
                # Se der erro de API (ex: 429 Too Many Requests), espera um pouco e tenta de novo ou para
                time.sleep(5) 
                if resp.status_code == 429: continue 
                break
                
            lote = resp.json().get('data', [])
            
            # Se o lote vier vazio, acabaram as páginas
            if not lote:
                print(f"🏁 Fim da extração. Página {pagina_atual} vazia.")
                tem_dados = False
                break

            buffer = []
            total_lote = len(lote)
            
            for i, p in enumerate(lote):
                try:
                    # Delay para não estourar o limite de requisições do Bling (3 req/s)
                    time.sleep(0.35) 
                    
                    print(f"   ↳ Detalhando {i+1}/{total_lote}: Pedido {p['id']}...", end='\r')
                    
                    url_detalhe = f"https://www.bling.com.br/Api/v3/pedidos/vendas/{p['id']}"
                    resp_det = requests.get(url_detalhe, headers={"Authorization": f"Bearer {service.get_valid_token()}"})

                    if resp_det.status_code != 200: continue
                    
                    det = resp_det.json().get('data')
                    itens = det.get('itens', [])
                    if not itens: continue

                    # --- CÁLCULO DE RATEIO PROPORCIONAL ---
                    val_desc_total = det.get('desconto', {}).get('valor', 0) or 0
                    val_frete_total = det.get('transporte', {}).get('frete', 0) or 0
                    
                    total_produtos = sum((i['valor'] * i['quantidade']) for i in itens)
                    if total_produtos == 0: total_produtos = 1

                    for item in itens:
                        valor_item_total = item['valor'] * item['quantidade']
                        peso_item = valor_item_total / total_produtos

                        desc_item_total = val_desc_total * peso_item
                        frete_item_total = val_frete_total * peso_item
                        
                        desc_unit = desc_item_total / item['quantidade']
                        frete_unit = frete_item_total / item['quantidade']
                        
                        desc_final = desc_unit + (item.get('desconto', 0) or 0)

                        buffer.append({
                            "id": det['id'], 
                            "sku": item['codigo'], 
                            "data_pedido": det['data'],
                            "origem": ORIGEM_DESTINO,
                            "loja": LOJA_NOME,
                            "quantidade": item['quantidade'],
                            "preco_unitario": item['valor'], 
                            "desconto": desc_final, 
                            "frete": frete_unit
                        })
                except Exception as e:
                    print(f"\n   ⚠️ Erro processando pedido {p.get('id')}: {e}")
            
            print("") # Pula linha após o progresso
            if buffer:
                salvar_pedidos(buffer)
            
            # Vai para próxima página
            pagina_atual += 1
        
        except Exception as e_page:
            print(f"❌ Erro crítico na página {pagina_atual}: {e_page}")
            time.sleep(10) # Espera antes de tentar de novo ou parar

if __name__ == "__main__":
    extrair_dezembro_loja()