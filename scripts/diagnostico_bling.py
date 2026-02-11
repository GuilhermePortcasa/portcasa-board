import requests
import json
import os

# --- CONFIG ---
try:
    from dotenv import load_dotenv
    load_dotenv()
except: pass

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

def get_token(loja):
    if not SUPABASE_URL: return None
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    url = f"{SUPABASE_URL}/rest/v1/integracoes_bling?nome_loja=eq.{loja}&select=access_token"
    try:
        r = requests.get(url, headers=headers)
        if r.status_code == 200 and r.json(): return r.json()[0]['access_token']
    except: pass
    return None

def diagnostico_compras(loja):
    token = get_token(loja)
    if not token: 
        print(f"❌ Pulei {loja} (sem token)")
        return

    headers = {"Authorization": f"Bearer {token}"}
    print(f"\n{'='*40}")
    print(f"🕵️  DIAGNÓSTICO COMPRAS: {loja}")
    print(f"{'='*40}")

    # 1. PEDIDOS DE COMPRA (Sem filtro de data para testar)
    print("\n📦 PEDIDOS DE COMPRA (Endpoint: /pedidos/compras):")
    try:
        r = requests.get("https://www.bling.com.br/Api/v3/pedidos/compras?limite=3", headers=headers)
        dados = r.json().get('data', [])
        
        if not dados:
            print("   ⚠️ Nenhum pedido de compra encontrado (Lista vazia).")
        else:
            print(f"   ✅ Encontrados {len(dados)} pedidos recentes.")
            # Analisa o primeiro para ver a estrutura
            p = dados[0]
            print(f"   Exemplo: Pedido {p.get('numero')} | Data: {p.get('data')}")
            print(f"   Situação (RAW): {p.get('situacao')}")
            print(f"   Total: {p.get('total')}")
            
            # Tenta detalhar para ver itens e custos
            id_pedido = p.get('id')
            if id_pedido:
                print(f"   🔎 Detalhando Pedido {id_pedido}...")
                r_det = requests.get(f"https://www.bling.com.br/Api/v3/pedidos/compras/{id_pedido}", headers=headers)
                detalhe = r_det.json().get('data', {})
                itens = detalhe.get('itens', [])
                if itens:
                    item = itens[0]
                    print(f"      Item: {item.get('descricao')}")
                    print(f"      Custo Unitário (campo 'valor'): {item.get('valor')}")
                    print(f"      IPI: {item.get('aliquotaIPI')}%")

    except Exception as e:
        print(f"   Erro ao ler pedidos: {e}")

    # 2. NOTAS FISCAIS DE ENTRADA (Tipo = 0)
    print("\n📄 NOTAS DE ENTRADA (Endpoint: /nfe?tipo=0):")
    try:
        # tipo=0 significa Entrada
        r = requests.get("https://www.bling.com.br/Api/v3/nfe?tipo=0&limite=3", headers=headers)
        notas = r.json().get('data', [])
        
        if not notas:
            print("   ⚠️ Nenhuma nota de entrada encontrada.")
        else:
            print(f"   ✅ Encontradas {len(notas)} notas de entrada recentes.")
            nf = notas[0]
            print(f"   Exemplo: Nota {nf.get('numero')} | Série: {nf.get('serie')} | Data: {nf.get('dataEmissao')}")
            print(f"   Situação: {nf.get('situacao')}")
            print(f"   Contato: {nf.get('contato', {}).get('nome')}")

            # Detalhar nota para ver custo real
            id_nota = nf.get('id')
            if id_nota:
                print(f"   🔎 Detalhando Nota {id_nota}...")
                r_det = requests.get(f"https://www.bling.com.br/Api/v3/nfe/{id_nota}", headers=headers)
                detalhe = r_det.json().get('data', {})
                # O Bling v3 às vezes chama itens de 'itens' ou estrutura diferente na NFe
                print(f"      Estrutura da Nota (Chaves): {list(detalhe.keys())}")

    except Exception as e:
        print(f"   Erro ao ler notas: {e}")

# --- EXECUÇÃO ---
diagnostico_compras("PORTCASA")
diagnostico_compras("PORTFIO")