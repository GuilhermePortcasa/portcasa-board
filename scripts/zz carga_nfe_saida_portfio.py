import requests
import time
from datetime import datetime, timedelta
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES ---
LOJA_NOME = "PORTFIO" # ou "CASA_MODELO", mude aqui conforme necessário
IDS_NATUREZA_BLOQUEADA = [
    7255067378, 7314982489, 7256147975, 6432743917, # PortFio
    15108547530, 15108547532                        # Casa Modelo
]

# Datas de Corte
DATA_INICIO = "2026-02-13" # YYYY-MM-DD
DATA_FIM = datetime.now().strftime("%Y-%m-%d") # Hoje

def salvar_lote_supabase(lote):
    if not lote: return
    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", 
        "Content-Type": "application/json"
    }
    # Tenta salvar
    r = requests.post(f"{SUPABASE_URL}/rest/v1/nfe_saida", headers=headers, json=lote)
    if r.status_code not in [200, 201, 204]:
        print(f"   ❌ Erro Supabase: {r.text}")
    else:
        print(f"   ✅ Lote de {len(lote)} notas salvo/atualizado.")

def repescagem_nfs():
    print(f"🎣 Iniciando Repescagem {LOJA_NOME} de {DATA_INICIO} a {DATA_FIM}...")
    service = BlingService(LOJA_NOME)
    
    pagina = 1
    tem_dados = True
    
    while tem_dados:
        print(f"📥 Baixando página {pagina} do Bling...")
        
        # Filtro de data de emissão no endpoint de NFe
        # Formato do filtro no Bling V3: ?dataEmissaoInicial=...&dataEmissaoFinal=...
        params = {
            "pagina": pagina,
            "limite": 100,
            "tipo": 1, # Apenas Saída
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

            buffer_supabase = []
            
            for nf_resumo in lote_nfs:
                # Filtragem preliminar (Situação)
                # Ignora: 1 (Pendente), 2 (Cancelada), 4 (Denegada), etc se necessário
                # Aqui vamos pegar autorizadas (6), emitida (3), etc.
                if nf_resumo['situacao'] in [2, 4]: continue 

                try:
                    # Detalha a nota para pegar itens
                    time.sleep(0.35) # Delay de segurança (3 req/s)
                    
                    resp_det = requests.get(
                        f"https://www.bling.com.br/Api/v3/nfe/{nf_resumo['id']}", 
                        headers={"Authorization": f"Bearer {service.get_valid_token()}"}
                    )
                    
                    if resp_det.status_code != 200: continue
                    nf = resp_det.json().get('data')
                    
                    # Filtros de Regra de Negócio
                    nat_id = nf.get('naturezaOperacao', {}).get('id')
                    if nat_id in IDS_NATUREZA_BLOQUEADA: continue
                    
                    itens = nf.get('itens', [])
                    if not itens: continue

                    # --- LÓGICA DE CÁLCULO (A mesma do Webhook corrigido) ---
                    val_frete_total = nf.get('valorFrete', 0) or 0
                    val_outras = nf.get('outrasDespesas', 0) or 0
                    val_nota_final = nf.get('valorNota', 0) or 0
                    
                    # Soma dos produtos (usando campo 'valor' correto)
                    soma_produtos = sum((i.get('valor', 0) or i.get('valorUnitario', 0)) * i['quantidade'] for i in itens)
                    if soma_produtos == 0: soma_produtos = 1

                    # Desconto Global Rateado
                    total_esperado = soma_produtos + val_frete_total + val_outras
                    val_desc_calculado = max(0, total_esperado - val_nota_final)

                    for item in itens:
                        # CORREÇÃO CRÍTICA: Prioridade para 'valor', fallback para 'valorUnitario'
                        preco = item.get('valor', 0) or item.get('valorUnitario', 0) or 0
                        
                        peso = (preco * item['quantidade']) / soma_produtos
                        
                        desc_rateio = (val_desc_calculado * peso) / item['quantidade']
                        frete_rateio = (val_frete_total * peso) / item['quantidade']

                        buffer_supabase.append({
                            "id": nf['id'], 
                            "sku": item['codigo'], 
                            "data_emissao": nf['dataEmissao'][:10],
                            "origem": "CASA_MODELO" if LOJA_NOME == "CASA_MODELO" else "SITE", 
                            "loja": LOJA_NOME,
                            "quantidade": item['quantidade'],
                            "preco_unitario": preco, 
                            "desconto": desc_rateio, 
                            "frete": frete_rateio    
                        })

                except Exception as e:
                    print(f"⚠️ Erro ao processar NF {nf_resumo['id']}: {e}")

            # Salva o lote da página no Supabase
            if buffer_supabase:
                salvar_lote_supabase(buffer_supabase)
            
            pagina += 1

        except Exception as e_page:
            print(f"❌ Erro fatal na página {pagina}: {e_page}")
            time.sleep(5) # Espera um pouco antes de tentar de novo ou parar

if __name__ == "__main__":
    repescagem_nfs()