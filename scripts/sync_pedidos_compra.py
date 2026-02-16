import os
import requests
import time
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES DE SITUAÇÃO (VALORES) ---
SITUACOES_MAP = {
    0: "Em Aberto",    
    1: "Atendido",     
    2: "Cancelado",    
    3: "Em Andamento", 
    4: "Atendido Parcialmente" 
}

SITUACOES_SALVAR = [1, 3] # Apenas Atendido e Em Andamento

BLACKLIST_FORNECEDORES = [
    "COM DE FIOS E TECIDOS PORTFIO", "COMERCIO DE FIOS E TECIDOS PORTFIO LTDA",
    "PORTCASA ON LINE LTDA", "SONO E CONFORTO COMERCIO LTDA"
]

cache_fornecedores = {}

def limpar_data(data_str):
    """
    Limpa e padroniza a data para YYYY-MM-DD.
    Aceita: '2026-02-16', '2026-02-16T13:48:15...', '0000-00-00'
    """
    if not data_str or str(data_str).startswith("0000"): 
        return None
    
    # Se vier com hora (T), pega só a data (primeiros 10 chars)
    if "T" in str(data_str):
        return data_str[:10]
        
    return data_str

def get_nome_fornecedor(service, id_fornecedor):
    if not id_fornecedor: return "FORNECEDOR NAO INFORMADO"
    if id_fornecedor in cache_fornecedores: return cache_fornecedores[id_fornecedor]
    try:
        token = service.get_valid_token()
        r = requests.get(f"https://www.bling.com.br/Api/v3/contatos/{id_fornecedor}", headers={"Authorization": f"Bearer {token}"})
        if r.status_code == 200:
            nome = r.json().get('data', {}).get('nome', 'DESCONHECIDO').upper()
            cache_fornecedores[id_fornecedor] = nome
            return nome
    except: pass
    return f"ID {id_fornecedor}"

def operacao_banco(metodo, tabela, dados=None, params=None):
    headers = {
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", "Content-Type": "application/json"
    }
    url = f"{SUPABASE_URL}/rest/v1/{tabela}"
    
    try:
        if metodo == "POST":
            r = requests.post(url, headers=headers, json=dados)
        elif metodo == "DELETE":
            r = requests.delete(f"{url}?{params}", headers=headers)
            
        if r.status_code not in [200, 201, 204]:
            print(f"      ❌ Erro Supabase ({metodo}): {r.text}")
    except Exception as e:
        print(f"      ❌ Erro Conexão Supabase: {e}")

def processar_loja(loja_nome):
    print(f"\n🚀 Sincronizando {loja_nome}...")
    service = BlingService(loja_nome)
    
    ids_processados_agora = set()
    params = {"limite": 100} 
    
    try:
        # Pega todas as páginas de pedidos de compra
        for lote in service.get_all_pages("/pedidos/compras", params=params):
            if not lote: continue

            # Dicionário temporário para agrupar itens duplicados no mesmo pedido
            # Chave: (id_pedido, sku) -> Valor: Objeto consolidado
            itens_consolidados = {}
            
            for p_resumo in lote:
                id_pedido = p_resumo['id']
                sit_valor = p_resumo.get('situacao', {}).get('valor')
                
                if sit_valor not in SITUACOES_SALVAR:
                    continue

                try:
                    time.sleep(0.05) # Rate limit preventivo
                    token = service.get_valid_token()
                    resp = requests.get(f"https://www.bling.com.br/Api/v3/pedidos/compras/{id_pedido}", headers={"Authorization": f"Bearer {token}"})
                    
                    if resp.status_code != 200: 
                        print(f"   ⚠️ Erro ao baixar pedido {id_pedido}: {resp.status_code}")
                        continue
                        
                    p = resp.json().get('data')
                    if not p: continue
                    
                    id_forn = p.get('fornecedor', {}).get('id')
                    nome_forn = get_nome_fornecedor(service, id_forn)
                    
                    if sit_valor == 1 and any(b in nome_forn for b in BLACKLIST_FORNECEDORES):
                        print(f"   🚫 Ignorando {nome_forn} (Blacklist)")
                        continue

                    ids_processados_agora.add(id_pedido)

                    # Cálculos Totais da Nota para Rateio
                    val_frete_nota = p.get('transporte', {}).get('frete', 0) or 0
                    val_ipi_nota = p.get('tributacao', {}).get('totalIPI', 0) or 0
                    
                    desc_obj = p.get('desconto', {})
                    val_desc_nota = desc_obj.get('valor', 0) or 0
                    if desc_obj.get('unidade') == 'PERCENTUAL':
                        val_desc_nota = (p.get('totalProdutos', 0) * val_desc_nota) / 100

                    itens = p.get('itens', [])
                    if not itens: continue

                    soma_bruta_nota = sum([(i.get('valor', 0) or 0) * (i.get('quantidade', 0) or 0) for i in itens])
                    if soma_bruta_nota == 0: soma_bruta_nota = 1

                    for item in itens:
                        sku = item.get('produto', {}).get('codigo', '').strip()
                        if not sku: continue

                        qtd = float(item.get('quantidade', 0) or 0)
                        v_unit = float(item.get('valor', 0) or 0)
                        
                        if qtd <= 0: continue

                        # Peso deste item na nota
                        peso = (v_unit * qtd) / soma_bruta_nota
                        
                        # Valores Unitários Calculados
                        desc_un = (val_desc_nota * peso) / qtd
                        frete_un = (val_frete_nota * peso) / qtd
                        ipi_un = (val_ipi_nota * peso) / qtd

                        chave_unica = (id_pedido, sku)

                        # Lógica de Consolidação (Resolve o erro 21000)
                        if chave_unica not in itens_consolidados:
                            itens_consolidados[chave_unica] = {
                                "id_pedido": id_pedido,
                                "sku": sku,
                                "data_pedido": limpar_data(p.get('data')),
                                "data_prevista": limpar_data(p.get('dataPrevista')),
                                "quantidade": qtd,
                                "preco_unitario": v_unit,
                                "desconto": desc_un,
                                "frete": frete_un,
                                "ipi": ipi_un,
                                "fornecedor": nome_forn,
                                "loja": loja_nome,
                                "situacao": SITUACOES_MAP.get(sit_valor, "Outros")
                            }
                        else:
                            # Se já existe, somamos as quantidades e recalculamos a média ponderada dos custos
                            existente = itens_consolidados[chave_unica]
                            qtd_antiga = existente["quantidade"]
                            qtd_nova = qtd_antiga + qtd
                            
                            # Evita divisão por zero se qtd_nova for 0 (improvável aqui, mas seguro)
                            if qtd_nova > 0:
                                # Média Ponderada do Preço e Custos
                                existente["preco_unitario"] = ((existente["preco_unitario"] * qtd_antiga) + (v_unit * qtd)) / qtd_nova
                                existente["desconto"] = ((existente["desconto"] * qtd_antiga) + (desc_un * qtd)) / qtd_nova
                                existente["frete"] = ((existente["frete"] * qtd_antiga) + (frete_un * qtd)) / qtd_nova
                                existente["ipi"] = ((existente["ipi"] * qtd_antiga) + (ipi_un * qtd)) / qtd_nova
                                existente["quantidade"] = qtd_nova
                            
                            print(f"      🔄 SKU {sku} duplicado no pedido {p.get('numero')}. Consolidado: Qtd {qtd_nova}")

                    print(f"   ✅ Processado: {p.get('numero')} - {nome_forn}")

                except Exception as e_item:
                    print(f"   ⚠️ Erro item {id_pedido}: {e_item}")

            # Envia o lote consolidado (sem duplicatas de chave)
            if itens_consolidados:
                operacao_banco("POST", "compras_pedidos", dados=list(itens_consolidados.values()))

        # 2. LIMPEZA (GARBAGE COLLECTION)
        if ids_processados_agora:
            print("🧹 Iniciando limpeza de pedidos obsoletos...")
            try:
                # Busca IDs existentes no banco para esta loja
                r_banco = requests.get(
                    f"{SUPABASE_URL}/rest/v1/compras_pedidos?select=id_pedido&loja=eq.{loja_nome}", 
                    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
                )
                if r_banco.status_code == 200:
                    ids_banco = set([row['id_pedido'] for row in r_banco.json()])
                    ids_para_remover = ids_banco - ids_processados_agora
                    
                    if ids_para_remover:
                        print(f"   🗑️ Removendo {len(ids_para_remover)} pedidos antigos/cancelados...")
                        lista_remocao = list(ids_para_remover)
                        batch_size = 50
                        for i in range(0, len(lista_remocao), batch_size):
                            lote_ids = lista_remocao[i:i+batch_size]
                            ids_str = ",".join(map(str, lote_ids))
                            operacao_banco("DELETE", "compras_pedidos", params=f"id_pedido=in.({ids_str})")
                    else:
                        print("   ✨ Nenhum pedido para remover.")
            except Exception as e_limp:
                print(f"   ⚠️ Erro na limpeza: {e_limp}")

    except Exception as e:
        print(f"❌ Erro geral {loja_nome}: {e}")

if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Erro: SUPABASE_URL e SUPABASE_KEY são obrigatórios.")
        exit(1)
        
    for loja in ["PORTFIO", "PORTCASA"]:
        processar_loja(loja)