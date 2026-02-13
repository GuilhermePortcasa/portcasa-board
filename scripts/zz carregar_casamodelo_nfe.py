import requests
import time
from datetime import datetime
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES CASA MODELO ---
LOJA_NOME = "CASA_MODELO"
ORIGEM_DESTINO = "CASA_MODELO"

# ⚠️ COLOQUE AQUI OS IDS QUE VOCÊ DESCOBRIU NO PASSO 1
IDS_NATUREZA_BLOQUEADA = [15108547530, 15108547532]

# Situações Válidas (Diferente de Pendente/Cancelada/etc)
# 5: Autorizada, 6: Emitida DANFE, 7: Registrada, 13: Autorizada (Correção)
SITUACOES_VALIDAS = [5, 6, 7, 13] 

def salvar_nfs(lote):
    if not lote: return
    
    # Agrupa itens duplicados (mesmo ID e SKU na mesma nota)
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
        print(f"   ✅ Lote de {len(lote_limpo)} itens salvo.")

def carregar_nfe_casamodelo(ano_inicio=2025):
    print(f"📦 Iniciando Carga NFe CASA MODELO ({ano_inicio})...")
    service = BlingService(LOJA_NOME)
    hoje = datetime.now()
    
    for ano in range(ano_inicio, hoje.year + 1):
        d_ini = f"{ano}-01-01 00:00:00"
        d_fim = f"{ano}-12-31 23:59:59"
        if ano == hoje.year: d_fim = hoje.strftime("%Y-%m-%d 23:59:59")
        
        print(f"📅 Processando Ano: {ano}")
        
        # Filtra por tipo=1 (Saída) e situações válidas
        params = {
            "dataEmissaoInicial": d_ini, 
            "dataEmissaoFinal": d_fim, 
            "tipo": 1, 
            "idsSituacoes[]": SITUACOES_VALIDAS,
            "limite": 100
        }

        try:
            for lote in service.get_all_pages("/nfe", params=params):
                buffer = []
                for nf_resumo in lote:
                    try:
                        time.sleep(0.06) 
                        url_detalhe = f"https://www.bling.com.br/Api/v3/nfe/{nf_resumo['id']}"
                        resp = requests.get(url_detalhe, headers={"Authorization": f"Bearer {service.get_valid_token()}"})

                        if resp.status_code != 200: continue
                        nf = resp.json().get('data')
                        if not nf: continue

                        # Filtros Extras
                        if str(nf.get('serie', '')).strip() != "1": continue # Apenas Série 1
                        if nf.get('naturezaOperacao', {}).get('id') in IDS_NATUREZA_BLOQUEADA: continue

                        itens = nf.get('itens', [])
                        if not itens: continue

                        # --- CÁLCULO REVERSO DE DESCONTO (Lógica Corrigida) ---
                        val_frete_total = nf.get('valorFrete', 0) or 0
                        val_seguro = nf.get('valorSeguro', 0) or 0
                        val_outras = nf.get('outrasDespesas', 0) or 0
                        val_nota_final = nf.get('valorNota', 0) or 0
                        
                        soma_produtos = sum((i.get('valorUnitario', 0) or i.get('valor', 0)) * i['quantidade'] for i in itens)
                        if soma_produtos == 0: soma_produtos = 1

                        # Desconto é a diferença entre o que deveria ser cobrado e o que foi cobrado
                        total_esperado = soma_produtos + val_frete_total + val_seguro + val_outras
                        val_desc_calculado = total_esperado - val_nota_final
                        if val_desc_calculado < 0: val_desc_calculado = 0

                        for item in itens:
                            preco = item.get('valorUnitario', 0) or item.get('valor', 0) or 0
                            
                            # Peso e Rateio
                            valor_item_total = preco * item['quantidade']
                            peso_item = valor_item_total / soma_produtos

                            desc_item_total = val_desc_calculado * peso_item
                            frete_item_total = val_frete_total * peso_item

                            desc_unit = desc_item_total / item['quantidade']
                            frete_unit = frete_item_total / item['quantidade']

                            buffer.append({
                                "id": nf['id'], 
                                "sku": item['codigo'], 
                                "data_emissao": nf['dataEmissao'][:10],
                                "origem": ORIGEM_DESTINO, 
                                "loja": LOJA_NOME,
                                "quantidade": item.get('quantidade', 0),
                                "preco_unitario": preco, 
                                "desconto": desc_unit, 
                                "frete": frete_unit
                            })
                    except Exception as e:
                        print(f"   ⚠️ Erro na NF {nf_resumo.get('id')}: {e}")

                if buffer:
                    salvar_nfs(buffer)
                    
        except Exception as e_page:
            print(f"❌ Erro crítico no ano {ano}: {e_page}")

if __name__ == "__main__":
    carregar_nfe_casamodelo(2025)