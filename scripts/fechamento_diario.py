import requests
from datetime import datetime
from bling_service import SUPABASE_URL, SUPABASE_KEY

def gerar_fechamento_diario():
    # Calcula a data de ONTEM
    ontem_obj = datetime.now() - timedelta(days=1)
    ontem_str = ontem_obj.strftime("%Y-%m-%d")
    ontem_titulo = ontem_obj.strftime("%d/%m")
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    print(f"📊 Gerando fechamento de {ontem_str}...")
    
    # Busca vendas de HOJE na view
    url_vendas = f"{SUPABASE_URL}/rest/v1/view_vendas_detalhadas?data_venda=eq.{ontem_str}"
    r = requests.get(url_vendas, headers=headers)
    
    if r.status_code != 200:
        print("Erro ao buscar vendas:", r.text)
        return
        
    vendas = r.json()
    
    tot_loja = 0
    tot_site = 0
    qtd_loja = 0
    qtd_site = 0
    
    for v in vendas:
        if v['canal_macro'] == 'LOJA':
            tot_loja += float(v['receita'])
            qtd_loja += 1
        else:
            tot_site += float(v['receita'])
            qtd_site += 1
            
    tot_geral = tot_loja + tot_site
    
    # Monta a notificação
    notificacao = {
        "tipo": "fechamento_diario",
        "titulo": f"Fechamento do Dia: {ontem_titulo}",
        "mensagem": f"Faturamento Total: R$ {tot_geral:,.2f} | Loja: R$ {tot_loja:,.2f} | Site: R$ {tot_site:,.2f}",
        "detalhes": {
            "data": ontem_str,
            "total_geral": tot_geral,
            "loja": {"receita": tot_loja, "pedidos": qtd_loja},
            "site": {"receita": tot_site, "pedidos": qtd_site}
        }
    }
    
    # Insere no Supabase
    requests.post(f"{SUPABASE_URL}/rest/v1/notificacoes", headers=headers, json=notificacao)
    
    # Limpa as antigas (Chama a função criada no Passo 1)
    requests.post(f"{SUPABASE_URL}/rest/v1/rpc/limpar_notificacoes_antigas", headers=headers)
    print("✅ Fechamento enviado e notificações velhas limpas.")

if __name__ == "__main__":
    gerar_fechamento_diario()
