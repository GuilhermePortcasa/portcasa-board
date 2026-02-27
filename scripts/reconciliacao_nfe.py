import requests
import time
from datetime import datetime, timedelta
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES TÉCNICAS (IGUAL AO WEBHOOK) ---
DIAS_BUSCA = 2 # Período de segurança para reconciliação

IDS_NATUREZA_BLOQUEADA = [
    7255067378, 7314982489, 7256147975, 6432743917, # PortFio
    15108547530, 15108547532                        # Casa Modelo
]

IDS_NATUREZA_DEVOLUCAO = [
    7255067378, 7314982489, 7256147975, 
    15108547531, 15108547533,
    15108451958, 15105899604, 15104895197,
    15106005559, 15104888811, 15104888810,
    15104888812, 15105145131, 15104888813, 15104888814,
    15107012796, 6937065086, 15103347853
]

ID_LOJA_PORTFIO_SITE = 204457689
IDS_NFE_IGNORAR = [1, 2, 4, 8, 9, 10] # Situações de cancelamento/pendência

# --- CONFIGURAÇÃO DE LOJAS PARA SYNC ---
LOJAS_SYNC = ["PORTFIO", "PORTCASA", "CASA_MODELO"]

def salvar_supabase(tabela, lote):
    if not lote: return
    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", 
        "Content-Type": "application/json"
    }
    url = f"{SUPABASE_URL}/rest/v1/{tabela}"
    r = requests.post(url, headers=headers, json=lote)
    if r.status_code not in [200, 201, 204]:
        print(f"   ❌ Erro Supabase [{tabela}]: {r.text}")
    else:
        print(f"   ✅ {len(lote)} registros em {tabela} sincronizados.")

def processar_reconciliacao_nfe():
    hoje = datetime.now()
    data_inicio = (hoje - timedelta(days=DIAS_BUSCA)).strftime("%Y-%m-%d")
    data_fim = hoje.strftime("%Y-%m-%d")

    print(f"🕵️ Iniciando Reconciliação de NFes (Vendas e Devoluções): {data_inicio} a {data_fim}")

    for nome_loja in LOJAS_SYNC:
        print(f"\n🚀 Sincronizando {nome_loja}...")
        service = BlingService(nome_loja)
        
        # Buscamos Saídas (1) e Entradas (0)
        for tipo_nfe in [1, 0]:
            print(f"📥 Buscando {'SAÍDAS' if tipo_nfe == 1 else 'ENTRADAS'}...")
            params = {
                "dataEmissaoInicial": f"{data_inicio} 00:00:00",
                "dataEmissaoFinal": f"{data_fim} 23:59:59",
                "tipo": tipo_nfe,
                "limite": 100
            }

            try:
                for lote in service.get_all_pages("/nfe", params=params):
                    buffer_vendas = []
                    buffer_devolucoes = []

                    for nf_resumo in lote:
                        id_nf = nf_resumo['id']

                        # --- NOVO: LÓGICA DE EXCLUSÃO (NOTAS CANCELADAS) ---
                        if nf_resumo['situacao'] in [2, 4]: 
                            print(f"   🗑️ NF {id_nf} cancelada/rejeitada. Removendo do banco...")
                            headers_del = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
                            requests.delete(f"{SUPABASE_URL}/rest/v1/nfe_saida?id=eq.{id_nf}", headers=headers_del)
                            requests.delete(f"{SUPABASE_URL}/rest/v1/devolucoes?id=eq.{id_nf}", headers=headers_del)
                            continue

                        try:
                            time.sleep(0.35)
                            id_nf = nf_resumo['id']
                            token = service.get_valid_token()
                            resp = requests.get(f"https://www.bling.com.br/Api/v3/nfe/{id_nf}", headers={"Authorization": f"Bearer {token}"})
                            
                            if resp.status_code != 200: continue
                            nf = resp.json().get('data')
                            if not nf: continue

                            nat_id = nf.get('naturezaOperacao', {}).get('id')
                            itens = nf.get('itens', [])
                            if not itens: continue

                            # --- CÁLCULOS TÉCNICOS DE RATEIO (MATEMÁTICA DO WEBHOOK) ---
                            v_frete = float(nf.get('valorFrete', 0) or 0)
                            v_outras = float(nf.get('outrasDespesas', 0) or 0)
                            v_nota_final = float(nf.get('valorNota', 0) or 0)

                            total_bruto_prods = sum([(float(i.get('valor') or i.get('valorUnitario') or 0) * float(i['quantidade'])) for i in itens])
                            if total_bruto_prods == 0: total_bruto_prods = 1
                            
                            v_desc_global = max(0, (total_bruto_prods + v_frete + v_outras) - v_nota_final)

                            # --- ROTA 1: VENDA (SAÍDA TIPO 1) ---
                            if nf['tipo'] == 1 and str(nf.get('serie')) == "1" and nat_id not in IDS_NATUREZA_BLOQUEADA:
                                for item in itens:
                                    preco = float(item.get('valor') or item.get('valorUnitario') or 0)
                                    peso = (preco * float(item['quantidade'])) / total_bruto_prods
                                    
                                    desc_rateio = v_desc_global * peso
                                    frete_rateio = v_frete * peso
                                    liquido = max(0, (preco * float(item['quantidade'])) - desc_rateio + frete_rateio)

                                    buffer_vendas.append({
                                        "id": id_nf,
                                        "sku": item['codigo'],
                                        "data_emissao": nf['dataEmissao'][:10],
                                        "origem": "CASA_MODELO" if nome_loja == "CASA_MODELO" else "SITE",
                                        "loja": nome_loja,
                                        "quantidade": item['quantidade'],
                                        "preco_unitario": preco,
                                        "desconto": desc_rateio,
                                        "frete": frete_rateio,
                                        "valor_total_liquido": liquido
                                    })

                            # --- ROTA 2: DEVOLUÇÃO (ENTRADA TIPO 0) ---
                            elif nf['tipo'] == 0 and nat_id in IDS_NATUREZA_DEVOLUCAO:
                                origem_dev = None
                                if nome_loja == 'PORTCASA' and str(nf.get('serie')) == "888" and nf['situacao'] == 1:
                                    origem_dev = "LOJA"
                                elif nome_loja == 'PORTFIO' and nf.get('loja', {}).get('id') == ID_LOJA_PORTFIO_SITE:
                                    origem_dev = "SITE"
                                elif nome_loja == 'CASA_MODELO':
                                    origem_dev = "CASA_MODELO"

                                if origem_dev:
                                    for item in itens:
                                        preco = float(item.get('valor') or item.get('valorUnitario') or 0)
                                        bruto_linha = preco * float(item['quantidade'])
                                        peso = bruto_linha / total_bruto_prods
                                        
                                        # Estorno = Bruto + Frete + Outras - Desconto
                                        estorno = max(0, (bruto_linha + (v_frete * peso) + (v_outras * peso)) - (v_desc_global * peso))

                                        buffer_devolucoes.append({
                                            "id": id_nf,
                                            "sku": item['codigo'],
                                            "data_devolucao": nf['dataEmissao'][:10],
                                            "origem": origem_dev,
                                            "loja": nome_loja,
                                            "quantidade": item['quantidade'],
                                            "valor_estorno": estorno
                                        })

                        except Exception as e_nf:
                            print(f"   ⚠️ Erro na NF {nf_resumo.get('id')}: {e_nf}")

                    # Salva os lotes processados
                    if buffer_vendas: salvar_supabase("nfe_saida", buffer_vendas)
                    if buffer_devolucoes: salvar_supabase("devolucoes", buffer_devolucoes)

            except Exception as e_loja:
                print(f"❌ Erro crítico no processo de {nome_loja}: {e_loja}")

if __name__ == "__main__":
    processar_reconciliacao_nfe()

    # --- NOVO: GATILHO DE ATUALIZAÇÃO DA VIEW DO DASHBOARD ---
    print("\n🔄 Sincronização concluída. Disparando atualização da View Gerencial no Banco...")
    try:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/refresh_mview_dashboard", 
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
        )
        if r.status_code in [200, 204]:
            print("✨ View do Dashboard recarregada com sucesso e pronta para uso!")
        else:
            print(f"⚠️ Aviso: Falha ao recarregar a View. O site usará dados do último ciclo. ({r.text})")
    except Exception as e:
        print(f"⚠️ Erro ao acionar o gatilho da View: {e}")
