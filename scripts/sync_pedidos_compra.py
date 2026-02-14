import requests
import time
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES DE SITUAÇÃO (VALORES) ---
# Mapeamento baseado nos seus testes:
SITUACOES_MAP = {
    0: "Em Aberto",    # Ignorar (conforme sua regra)
    1: "Atendido",     # Salvar
    2: "Cancelado",    # Remover do banco se existir
    3: "Em Andamento", # Salvar
    4: "Atendido Parcialmente" # Tratar como Andamento ou Atendido? (Assumindo Andamento por segurança)
}

SITUACOES_SALVAR = [1, 3] # Apenas Atendido e Em Andamento

BLACKLIST_FORNECEDORES = [
    "COM DE FIOS E TECIDOS PORTFIO", "COMERCIO DE FIOS E TECIDOS PORTFIO LTDA",
    "PORTCASA ON LINE LTDA", "SONO E CONFORTO COMERCIO LTDA",
    "MULTIART COMERCIO IMPORTACAO LTDA", "MBF INDUSTRIA DE TECIDOS E CONFECCOES LTDA EPP"
]

cache_fornecedores = {}

def limpar_data(data_str):
    if not data_str or data_str == "0000-00-00": return None
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
    
    if metodo == "POST":
        r = requests.post(url, headers=headers, json=dados)
    elif metodo == "DELETE":
        # Delete requer query params na URL (ex: ?id_pedido=eq.123)
        r = requests.delete(f"{url}?{params}", headers=headers)
        
    if r.status_code not in [200, 201, 204]:
        print(f"      ❌ Erro Supabase ({metodo}): {r.text}")

def processar_loja(loja_nome):
    print(f"\n🚀 Sincronizando {loja_nome}...")
    service = BlingService(loja_nome)
    
    # Conjunto para rastrear IDs processados nesta execução
    ids_processados_agora = set()
    
    # 1. BUSCA E ATUALIZAÇÃO (UPSERT)
    params = {"limite": 100} 
    try:
        for lote in service.get_all_pages("/pedidos/compras", params=params):
            buffer_upsert = []
            
            for p_resumo in lote:
                id_pedido = p_resumo['id']
                sit_valor = p_resumo.get('situacao', {}).get('valor')
                
                # Se for Cancelado ou Em Aberto, não processamos os itens, mas marcamos o ID
                # para garantir que ele seja removido do banco se estiver lá.
                if sit_valor not in SITUACOES_SALVAR:
                    # Se encontrarmos um pedido Cancelado que já estava no banco, precisamos deletá-lo.
                    # Faremos isso na etapa de limpeza final ou aqui mesmo se preferir.
                    # Por enquanto, apenas ignoramos a *leitura* dele.
                    continue

                try:
                    time.sleep(0.05)
                    token = service.get_valid_token()
                    resp = requests.get(f"https://www.bling.com.br/Api/v3/pedidos/compras/{id_pedido}", headers={"Authorization": f"Bearer {token}"})
                    if resp.status_code != 200: continue
                    p = resp.json().get('data')
                    
                    id_forn = p.get('fornecedor', {}).get('id')
                    nome_forn = get_nome_fornecedor(service, id_forn)
                    
                    # Filtro de Blacklist (Apenas para Atendidos, ou geral? Seu pedido original dizia Atendido)
                    # Se for regra geral para não poluir o banco, aplicamos sempre.
                    if any(b in nome_forn for b in BLACKLIST_FORNECEDORES):
                        print(f"   🚫 Ignorando {nome_forn} (Blacklist)")
                        continue

                    # Adiciona ID ao conjunto de processados
                    ids_processados_agora.add(id_pedido)

                    # Cálculos de Rateio
                    val_frete = p.get('transporte', {}).get('frete', 0)
                    val_ipi = p.get('tributacao', {}).get('totalIPI', 0)
                    
                    desc_obj = p.get('desconto', {})
                    val_desc = desc_obj.get('valor', 0)
                    if desc_obj.get('unidade') == 'PERCENTUAL':
                        val_desc = (p.get('totalProdutos', 0) * val_desc) / 100

                    itens = p.get('itens', [])
                    soma_bruta = sum([i['valor'] * i['quantidade'] for i in itens]) or 1

                    for item in itens:
                        sku = item.get('produto', {}).get('codigo', '').strip()
                        if not sku: continue

                        qtd = item['quantidade']
                        v_unit = item['valor']
                        peso = (v_unit * qtd) / soma_bruta
                        
                        buffer_upsert.append({
                            "id_pedido": id_pedido,
                            "sku": sku,
                            "data_pedido": limpar_data(p.get('data')),
                            "data_prevista": limpar_data(p.get('dataPrevista')),
                            "quantidade": qtd,
                            "preco_unitario": v_unit,
                            "desconto": (val_desc * peso) / qtd if qtd else 0,
                            "frete": (val_frete * peso) / qtd if qtd else 0,
                            "ipi": (val_ipi * peso) / qtd if qtd else 0,
                            "fornecedor": nome_forn,
                            "loja": loja_nome,
                            "situacao": SITUACOES_MAP.get(sit_valor, "Outros")
                        })
                    
                    print(f"   ✅ Processado: {p['numero']} - {nome_forn}")

                except Exception as e_item:
                    print(f"   ⚠️ Erro item {id_pedido}: {e_item}")

            if buffer_upsert:
                operacao_banco("POST", "compras_pedidos", dados=buffer_upsert)

        # 2. LIMPEZA (GARBAGE COLLECTION)
        # Agora removemos do banco tudo desta loja que NÃO está na lista 'ids_processados_agora'
        # Mas CUIDADO: Se a paginação falhou ou se rodamos parcial, podemos deletar coisa errada.
        # Como estamos rodando SEM filtro de data (tudo), é seguro assumir que o que não veio
        # ou foi excluído, ou cancelado, ou mudou de status.
        
        if ids_processados_agora:
            print("🧹 Iniciando limpeza de pedidos obsoletos...")
            
            # Busca todos os IDs que estão no banco para esta loja
            # (Essa parte requer uma chamada ao Supabase para comparar)
            r_banco = requests.get(
                f"{SUPABASE_URL}/rest/v1/compras_pedidos?select=id_pedido&loja=eq.{loja_nome}", 
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
            )
            
            ids_banco = set([row['id_pedido'] for row in r_banco.json()])
            ids_para_remover = ids_banco - ids_processados_agora
            
            if ids_para_remover:
                print(f"   🗑️ Removendo {len(ids_para_remover)} pedidos antigos/cancelados...")
                # Remove em lotes para não estourar a URL
                lista_remocao = list(ids_para_remover)
                batch_size = 50
                for i in range(0, len(lista_remocao), batch_size):
                    lote_ids = lista_remocao[i:i+batch_size]
                    ids_str = ",".join(map(str, lote_ids))
                    operacao_banco("DELETE", "compras_pedidos", params=f"id_pedido=in.({ids_str})")
            else:
                print("   ✨ Nenhum pedido para remover.")

    except Exception as e:
        print(f"❌ Erro geral {loja_nome}: {e}")

if __name__ == "__main__":
    for loja in ["PORTFIO", "PORTCASA"]:
        processar_loja(loja)