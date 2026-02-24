import requests
import time
from datetime import datetime, timedelta
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES DE RECONCILIAÇÃO ---
DIAS_BUSCA = 2 # Busca as últimas 48h para garantir que nada escape
ID_SIT_ATENDIDO = 9
ID_SIT_FULL = 375989 # Situação específica do FULL no seu Bling

CONFIG_RECONCILIACAO = [
    {
        "loja": "PORTCASA",
        "situacao": ID_SIT_ATENDIDO,
        "origem_label": "LOJA"
    },
    {
        "loja": "PORTFIO",
        "situacao": ID_SIT_FULL,
        "origem_label": "SITE_FULL"
    }
]

def salvar_pedidos_supabase(lote):
    if not lote: return
    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", 
        "Content-Type": "application/json"
    }
    url = f"{SUPABASE_URL}/rest/v1/pedidos_venda"
    
    r = requests.post(url, headers=headers, json=lote)
    if r.status_code not in [200, 201, 204]:
        print(f"   ❌ Erro Supabase: {r.text}")
    else:
        print(f"   ✅ {len(lote)} itens de pedidos sincronizados (Upsert).")

def processar_reconciliacao():
    hoje = datetime.now()
    data_inicio = (hoje - timedelta(days=DIAS_BUSCA)).strftime("%Y-%m-%d")
    data_fim = hoje.strftime("%Y-%m-%d")

    print(f"🔍 Iniciando Reconciliação de Pedidos: {data_inicio} até {data_fim}")

    for config in CONFIG_RECONCILIACAO:
        nome_loja = config['loja']
        origem_alvo = config['origem_label']
        print(f"\n🚀 Verificando {nome_loja} (Buscando {origem_alvo})...")
        
        service = BlingService(nome_loja)
        params = {
            "dataInicial": data_inicio,
            "dataFinal": data_fim,
            "idsSituacoes[]": config['situacao'],
            "limite": 100
        }

        try:
            for lote in service.get_all_pages("/pedidos/vendas", params=params):
                buffer_pedidos = []
                
                for p_resumo in lote:
                    try:
                        time.sleep(0.35) # Respeita o rate limit de 3 req/s
                        
                        id_bling = p_resumo['id']
                        url_det = f"https://www.bling.com.br/Api/v3/pedidos/vendas/{id_bling}"
                        token = service.get_valid_token()
                        resp = requests.get(url_det, headers={"Authorization": f"Bearer {token}"})

                        if resp.status_code != 200: continue
                        v = resp.json().get('data')
                        if not v: continue

                        itens = v.get('itens', [])
                        if not itens: continue

                        # --- LÓGICA IDENTICA AO WEBHOOK ---
                        
                        # 1. Calcula Desconto Global (converte % para R$ se necessário)
                        total_produtos_v3 = float(v.get('totalProdutos', 0) or 0)
                        val_desc_global = float(v.get('desconto', {}).get('valor', 0) or 0)
                        if v.get('desconto', {}).get('unidade') == 'PERCENTUAL':
                            val_desc_global = (total_produtos_v3 * val_desc_global) / 100

                        val_frete_total = float(v.get('transporte', {}).get('frete', 0) or 0)
                        
                        # Base de rateio (Soma o que está no campo 'valor' do item no V3)
                        total_venda_base = sum([(float(i.get('valor', 0)) * float(i.get('quantidade', 0))) for i in itens])
                        if total_venda_base == 0: total_venda_base = 1

                        for item in itens:
                            sku = item.get('codigo', '').strip()
                            if not sku: continue

                            # No V3 o item['valor'] já vem com desconto de item. 
                            # O rateio é sobre o Desconto Global e Frete.
                            preco_unitario = float(item.get('valor', 0))
                            qtd = int(float(item.get('quantidade', 0)))
                            
                            valor_bruto_linha = preco_unitario * qtd
                            peso = valor_bruto_linha / total_venda_base
                            
                            desc_global_rateado = val_desc_global * peso
                            frete_rateado = val_frete_total * peso
                            
                            # Valor Líquido Final da Linha (Fórmula do Webhook)
                            valor_liquido_final = max(0, valor_bruto_linha - desc_global_rateado + frete_rateado)

                            buffer_pedidos.append({
                                "id": id_bling,
                                "sku": sku,
                                "data_pedido": v.get('data'),
                                "origem": origem_alvo,
                                "loja": nome_loja,
                                "quantidade": qtd,
                                "preco_unitario": preco_unitario,
                                "desconto": desc_global_rateado + float(item.get('desconto', 0) or 0),
                                "frete": frete_rateado,
                                "valor_total_liquido": valor_liquido_final
                            })

                    except Exception as e_item:
                        print(f"   ⚠️ Erro no pedido {p_resumo.get('id')}: {e_item}")

                if buffer_pedidos:
                    salvar_pedidos_supabase(buffer_pedidos)

        except Exception as e_loja:
            print(f"❌ Erro crítico na loja {nome_loja}: {e_loja}")

if __name__ == "__main__":
    processar_reconciliacao()
