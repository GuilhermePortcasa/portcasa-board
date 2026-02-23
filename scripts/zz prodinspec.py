import requests
import json
from bling_service import BlingService

def inspecionar_produto_bling(nome_loja, id_produto):
    print(f"\n🔍 Buscando o produto ID {id_produto} na loja {nome_loja}...")
    
    # Inicia o serviço para pegar o token atualizado
    service = BlingService(nome_loja)
    token = service.get_valid_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # Endpoint de consulta unitária
    url = f"https://www.bling.com.br/Api/v3/produtos/{id_produto}"
    
    r = requests.get(url, headers=headers)
    
    if r.status_code == 200:
        dados_json = r.json()
        
        # 1. Salva em um arquivo local para facilitar a análise
        nome_arquivo = f"produto_{id_produto}.json"
        with open(nome_arquivo, "w", encoding="utf-8") as f:
            json.dump(dados_json, f, ensure_ascii=False, indent=4)
            
        print(f"✅ Sucesso! JSON completo salvo no arquivo: {nome_arquivo}")
        
        # 2. Imprime no terminal (opcional)
        print("\n--- PREVIEW DO JSON (100 primeiras linhas) ---")
        json_str = json.dumps(dados_json, ensure_ascii=False, indent=4)
        linhas = json_str.split("\n")
        print("\n".join(linhas[:100]))
        if len(linhas) > 100:
            print("...\n(Restante omitido no console. Abra o arquivo .json criado para ver tudo!)")
            
    else:
        print(f"❌ Erro na consulta (Status {r.status_code}): {r.text}")

if __name__ == "__main__":
    # Testa exatamente o ID que você pediu na PORTCASA
    inspecionar_produto_bling("PORTCASA", "16590639769")