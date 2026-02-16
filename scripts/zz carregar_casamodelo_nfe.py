import requests
import time
from datetime import datetime
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES ---
LOJA_NOME = "CASA_MODELO"
ORIGEM_DESTINO = "CASA_MODELO"

# Naturezas que NÃO devem entrar (Devoluções de compra, Remessas, etc)
IDS_NATUREZA_BLOQUEADA = [15108547530, 15108547532]

# Período de Repescagem
DATA_INICIO = "2026-02-13" # Sexta-feira
DATA_FIM = datetime.now().strftime("%Y-%m-%d") # Hoje

def salvar_lote_supabase(lote):
    if not lote: return
    
    # Remove duplicatas (mesmo ID e SKU)
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
    
    r = requests.post(f"{SUPABASE_URL}/rest/v1/nfe_saida", headers=headers, json=lote_limpo)
    
    if r.status_code not in [200, 201, 204]:
        print(f"   ❌ Erro Supabase: {r.text}")
    else:
        print(f"   ✅ Lote de {len(lote_limpo)} notas salvo/atualizado.")

def repescagem_casamodelo():
    print(f"🎣 Iniciando Repescagem {LOJA_NOME} de {DATA_INICIO} a {DATA_FIM}...")
    service = BlingService(LOJA_NOME)
    
    pagina = 1
    tem_dados = True
    
    while tem_dados:
        print(f"📥 Baixando página {pagina}...")
        
        # Filtra apenas NFs de Saída emitidas no período
        params = {
            "pagina": pagina,
            "limite": 100,
            "tipo": 1, 
            "dataEmissaoInicial": f"{DATA_INICIO} 00:00:00",
            "dataEmissaoFinal": f"{DATA_FIM} 23:59:59"
        }

        try:
            resp = requests.get(
                "https://www.bling.com.br/Api/v3/nfe",
                headers={"Authorization": f"Bearer {service.get_valid_token()}"},
                params=params
            )
            
            if resp.status_code != 200:
                print(f"❌ Erro API Bling: {resp.status_code} - {resp.text}")
                break

            lote_nfs = resp.json().get('data', [])
            if not lote_nfs:
                tem_dados = False
                print("🏁 Fim das páginas.")
                break

            buffer = []
            
            for nf_resumo in lote_nfs:
                # Ignora notas canceladas (2) ou denegadas (4)
                if nf_resumo['situacao'] in [2, 4]: continue 

                try:
                    time.sleep(0.35) 
                    
                    resp_det = requests.get(
                        f"https://www.bling.com.br/Api/v3/nfe/{nf_resumo['id']}", 
                        headers={"Authorization": f"Bearer {service.get_valid_token()}"}
                    )
                    
                    if resp_det.status_code != 200: continue
                    nf = resp_det.json().get('data')
                    
                    # Filtro de Natureza
                    nat_id = nf.get('naturezaOperacao', {}).get('id')
                    if nat_id in IDS_NATUREZA_BLOQUEADA: continue
                    
                    # Filtro de Série (Opcional, mas recomendado para Casa Modelo)
                    # if str(nf.get('serie', '')).strip() != "1": continue

                    itens = nf.get('itens', [])
                    if not itens: continue

                    # --- LÓGICA DE CÁLCULO (Mesma do Webhook) ---
                    val_frete_total = nf.get('valorFrete', 0) or 0
                    val_outras = nf.get('outrasDespesas', 0) or 0
                    val_nota_final = nf.get('valorNota', 0) or 0
                    
                    soma_produtos = sum((i.get('valor', 0) or i.get('valorUnitario', 0)) * i['quantidade'] for i in itens)
                    if soma_produtos == 0: soma_produtos = 1

                    total_esperado = soma_produtos + val_frete_total + val_outras
                    val_desc_calculado = max(0, total_esperado - val_nota_final)

                    for item in itens:
                        preco = item.get('valor', 0) or item.get('valorUnitario', 0) or 0
                        peso = (preco * item['quantidade']) / soma_produtos
                        
                        desc_rateio = (val_desc_calculado * peso) / item['quantidade']
                        frete_rateio = (val_frete_total * peso) / item['quantidade']

                        buffer.append({
                            "id": nf['id'], 
                            "sku": item['codigo'], 
                            "data_emissao": nf['dataEmissao'][:10],
                            "origem": ORIGEM_DESTINO, 
                            "loja": LOJA_NOME,
                            "quantidade": item['quantidade'],
                            "preco_unitario": preco, 
                            "desconto": desc_rateio, 
                            "frete": frete_rateio    
                        })

                except Exception as e:
                    print(f"⚠️ Erro ao processar NF {nf_resumo['id']}: {e}")

            if buffer:
                salvar_lote_supabase(buffer)
            
            pagina += 1

        except Exception as e_page:
            print(f"❌ Erro fatal na página {pagina}: {e_page}")
            time.sleep(5)

if __name__ == "__main__":
    repescagem_casamodelo()