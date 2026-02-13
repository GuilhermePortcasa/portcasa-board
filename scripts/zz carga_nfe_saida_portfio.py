import requests
import time
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES ---
LOJA_NOME = "PORTFIO"
IDS_NATUREZA_BLOQUEADA = [7255067378, 7314982489, 7256147975, 6432743917]

# 🎯 PONTO DE RETOMADA (Baseado no seu log de erro)
INDICE_RETOMADA = 2680 

def buscar_todos_ids_supabase():
    print("📡 Buscando IDs de NFs no Supabase (Paginação)...")
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    
    todos_ids = set()
    offset = 0
    limit = 1000
    
    while True:
        # Mantendo a ordem decrescente de emissão para alinhar com a lógica
        url = f"{SUPABASE_URL}/rest/v1/nfe_saida?select=id&loja=eq.{LOJA_NOME}&offset={offset}&limit={limit}&order=data_emissao.desc"
        try:
            r = requests.get(url, headers=headers)
            if r.status_code != 200: break
            dados = r.json()
            if not dados: break
            for item in dados: todos_ids.add(item['id'])
            print(f"   ↳ Baixados {len(dados)} registros... (Total único: {len(todos_ids)})")
            if len(dados) < limit: break
            offset += limit
        except: break
    
    # IMPORTANTE: Ordenamos a lista para garantir consistência na retomada
    # Reverse=True para processar das mais novas para as mais antigas (igual a query)
    lista_ordenada = sorted(list(todos_ids), reverse=True)
    
    print(f"✅ Total final: {len(lista_ordenada)} notas únicas encontradas.")
    return lista_ordenada

def salvar_correcao(lote):
    if not lote: return
    itens_unicos = {}
    for item in lote:
        chave = (item['id'], item['sku'])
        if chave in itens_unicos:
            itens_unicos[chave]['quantidade'] += item['quantidade']
        else:
            itens_unicos[chave] = item.copy()
    lote_limpo = list(itens_unicos.values())

    headers = {
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", "Content-Type": "application/json"
    }
    requests.post(f"{SUPABASE_URL}/rest/v1/nfe_saida", headers=headers, json=lote_limpo)
    print(f"   ✅ Lote de {len(lote_limpo)} itens corrigido.")

def corrigir_nfs_portfio():
    ids_para_corrigir = buscar_todos_ids_supabase()
    if not ids_para_corrigir: return

    # --- LÓGICA DE RETOMADA ---
    print(f"⏩ Pulando os primeiros {INDICE_RETOMADA} registros já processados...")
    # Fatia a lista para pegar apenas do índice 2680 para frente
    ids_para_corrigir = ids_para_corrigir[INDICE_RETOMADA:]
    
    print(f"🚀 Retomando correção de {len(ids_para_corrigir)} notas restantes...")

    service = BlingService(LOJA_NOME)
    buffer = []
    contador = 0 # Reinicia contador visual

    for id_bling in ids_para_corrigir:
        try:
            time.sleep(0.06)
            url_detalhe = f"https://www.bling.com.br/Api/v3/nfe/{id_bling}"
            resp = requests.get(url_detalhe, headers={"Authorization": f"Bearer {service.get_valid_token()}"})

            if resp.status_code != 200: continue
            nf = resp.json().get('data')
            if not nf: continue
            if nf['tipo'] != 1: continue 
            if nf.get('naturezaOperacao', {}).get('id') in IDS_NATUREZA_BLOQUEADA: continue

            itens = nf.get('itens', [])
            if not itens: continue

            # --- CÁLCULO REVERSO ---
            val_frete_total = nf.get('valorFrete', 0) or 0
            val_seguro = nf.get('valorSeguro', 0) or 0
            val_outras = nf.get('outrasDespesas', 0) or 0
            val_nota_final = nf.get('valorNota', 0) or 0
            
            soma_produtos = sum((i.get('valorUnitario', 0) or i.get('valor', 0)) * i['quantidade'] for i in itens)
            if soma_produtos == 0: soma_produtos = 1

            total_esperado = soma_produtos + val_frete_total + val_seguro + val_outras
            val_desc_calculado = total_esperado - val_nota_final
            if val_desc_calculado < 0: val_desc_calculado = 0

            for item in itens:
                preco = item.get('valorUnitario', 0) or item.get('valor', 0) or 0
                
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
                    "origem": "SITE", 
                    "loja": LOJA_NOME,
                    "quantidade": item['quantidade'],
                    "preco_unitario": preco, 
                    "desconto": desc_unit, 
                    "frete": frete_unit    
                })
            
            contador += 1
            if len(buffer) >= 200:
                salvar_correcao(buffer)
                buffer = []
                # Mostra o progresso somado ao ponto de partida
                print(f"⏳ Progresso: {INDICE_RETOMADA + contador}...")

        except Exception as e:
            print(f"❌ Erro na NF {id_bling}: {e}")

    if buffer: salvar_correcao(buffer)
    print("🏁 Correção Finalizada!")

if __name__ == "__main__":
    corrigir_nfs_portfio()