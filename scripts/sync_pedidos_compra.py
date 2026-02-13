import requests
import time
from datetime import datetime, timedelta
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÕES IDENTIFICADAS ---
VALOR_SIT_EM_ANDAMENTO = 3
VALOR_SIT_ATENDIDO = 1

BLACKLIST_FORNECEDORES = [
    "COM DE FIOS E TECIDOS PORTFIO", "COMERCIO DE FIOS E TECIDOS PORTFIO LTDA",
    "PORTCASA ON LINE LTDA", "SONO E CONFORTO COMERCIO LTDA",
    "MULTIART COMERCIO IMPORTACAO LTDA", "MBF INDUSTRIA DE TECIDOS E CONFECCOES LTDA EPP"
]

def salvar_no_supabase(tabela, lote):
    if not lote: return
    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", 
        "Content-Type": "application/json"
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{tabela}", headers=headers, json=lote)
    if r.status_code not in [200, 201, 204]:
        print(f"      ❌ Erro Supabase em {tabela}: {r.text}")

def processar_pedidos_compra(loja_nome):
    print(f"\n🚀 Sincronizando Pedidos de Compra: {loja_nome}")
    service = BlingService(loja_nome)
    
    # Sincroniza pedidos dos últimos 60 dias para capturar mudanças de status (Andamento -> Atendido)
    data_inicio = (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")
    
    # Nota: Usamos get_all_pages que já gerencia o token internamente
    params = {"dataInicial": data_inicio, "limite": 100}

    buffer_andamento = []
    buffer_atendido = []

    try:
        for lote in service.get_all_pages("/pedidos/compras", params=params):
            for p_resumo in lote:
                # Filtro pelo VALOR da situação identificado no Raio-X
                sit_valor = p_resumo.get('situacao', {}).get('valor')
                
                if sit_valor not in [VALOR_SIT_EM_ANDAMENTO, VALOR_SIT_ATENDIDO]:
                    continue

                try:
                    time.sleep(0.05)
                    token = service.get_valid_token()
                    resp = requests.get(
                        f"https://www.bling.com.br/Api/v3/pedidos/compras/{p_resumo['id']}", 
                        headers={"Authorization": f"Bearer {token}"}
                    )
                    if resp.status_code != 200: continue
                    p = resp.json().get('data')
                    
                    fornecedor_nome = p.get('fornecedor', {}).get('nome', '').upper()

                    # Lógica de custos e rateio
                    val_frete = p.get('transporte', {}).get('frete', 0)
                    val_desc = p.get('desconto', {}).get('valor', 0)
                    val_ipi_total = p.get('tributacao', {}).get('totalIPI', 0)
                    
                    itens = p.get('itens', [])
                    soma_prod = sum([i['valor'] * i['quantidade'] for i in itens]) or 1

                    for item in itens:
                        sku = item.get('produto', {}).get('codigo', '').strip()
                        if not sku: continue

                        qtd = item['quantidade']
                        valor_unit = item['valor']
                        peso_item = (valor_unit * qtd) / soma_prod
                        
                        # Rateio proporcional de custos extras
                        frete_un = (val_frete * peso_item) / qtd if qtd > 0 else 0
                        desc_un = (val_desc * peso_item) / qtd if qtd > 0 else 0
                        ipi_un = (val_ipi_total * peso_item) / qtd if qtd > 0 else 0

                        if sit_valor == VALOR_SIT_EM_ANDAMENTO:
                            buffer_andamento.append({
                                "id_pedido": p['id'],
                                "sku": sku,
                                "data_pedido": p['data'],
                                "data_prevista": p.get('dataPrevista'),
                                "quantidade": qtd,
                                "preco_unitario": valor_unit,
                                "fornecedor": fornecedor_nome,
                                "loja": loja_nome,
                                "situacao": "Em Andamento"
                            })
                        
                        elif sit_valor == VALOR_SIT_ATENDIDO:
                            # Filtro de fornecedores internos apenas para pedidos atendidos (custo real)
                            if any(b in fornecedor_nome for b in BLACKLIST_FORNECEDORES):
                                continue

                            buffer_atendido.append({
                                "id_bling": p['id'],
                                "sku": sku,
                                "data_entrada": p['data'],
                                "quantidade": qtd,
                                "custo_unitario": valor_unit,
                                "desconto": desc_un,
                                "frete": frete_un,
                                "ipi": ipi_un,
                                "nfe": f"PC-{p['numero']}",
                                "fornecedor": fornecedor_nome,
                                "loja": loja_nome
                            })

                except Exception as e_det:
                    print(f"   ⚠️ Erro pedido {p_resumo.get('id')}: {e_det}")

            # Envia para o Supabase a cada página processada
            if buffer_andamento:
                salvar_no_supabase("pedidos_compra_item", buffer_andamento)
                buffer_andamento = []
            if buffer_atendido:
                salvar_no_supabase("entradas_compras", buffer_atendido)
                buffer_atendido = []

        print(f"   ✅ Sincronização de {loja_nome} concluída.")

    except Exception as e:
        print(f"❌ Erro crítico na loja {loja_nome}: {e}")

if __name__ == "__main__":
    for loja in ["PORTFIO", "PORTCASA"]:
        processar_pedidos_compra(loja)