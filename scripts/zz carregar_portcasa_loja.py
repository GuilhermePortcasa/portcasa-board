import requests
import time
from datetime import datetime
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES ---
ID_SIT_ATENDIDO = 9
LOJA_NOME = "PORTCASA"
ORIGEM_DESTINO = "LOJA"

# 🎯 LISTA DE PÁGINAS ESPECÍFICAS PARA CORRIGIR
PAGINAS_ALVO = [17] 

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
    r = requests.post(f"{SUPABASE_URL}/rest/v1/pedidos_venda", headers=headers, json=lote_limpo)
    
    if r.status_code not in [200, 201, 204]:
        print(f"   ❌ Erro Supabase: {r.text}")
    else:
        print(f"   ✅ {len(lote_limpo)} pedidos 'LOJA' salvos com sucesso.")

def carregar_portcasa_atendidos_manual(ano_inicio=2025):
    print(f"📦 Iniciando Correção PORTCASA - Páginas: {PAGINAS_ALVO}")
    service = BlingService(LOJA_NOME)
    hoje = datetime.now()
    
    for ano in range(ano_inicio, hoje.year + 1):
        d_ini = f"{ano}-01-01"
        d_fim = f"{ano}-12-31"
        if ano == hoje.year: d_fim = hoje.strftime("%Y-%m-%d")
        
        print(f"📅 Processando Ano: {ano} (Período: {d_ini} a {d_fim})")
        
        params = {
            "dataInicial": d_ini, 
            "dataFinal": d_fim, 
            "idsSituacoes[]": ID_SIT_ATENDIDO, 
            "limite": 100
        }

        # ITERA APENAS NAS PÁGINAS DA LISTA
        for pagina_atual in PAGINAS_ALVO:
            try:
                print(f"📥 PORTCASA: Baixando /pedidos/vendas (Pág {pagina_atual})...")
                params["pagina"] = pagina_atual
                
                resp = requests.get(
                    "https://www.bling.com.br/Api/v3/pedidos/vendas",
                    headers={"Authorization": f"Bearer {service.get_valid_token()}"},
                    params=params
                )
                
                if resp.status_code != 200:
                    print(f"❌ Erro API Bling Pág {pagina_atual}: {resp.status_code}")
                    continue
                    
                lote = resp.json().get('data', [])
                if not lote:
                    print(f"⚠️ Página {pagina_atual} está vazia.")
                    continue

                buffer = []
                for p in lote:
                    try:
                        time.sleep(0.04) 
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
                        print(f"   ⚠️ Erro no pedido {p.get('id')}: {e}")
                
                if buffer:
                    salvar_pedidos(buffer)
            
            except Exception as e_page:
                print(f"❌ Erro crítico na página {pagina_atual}: {e_page}")

if __name__ == "__main__":
    carregar_portcasa_atendidos_manual(2025)