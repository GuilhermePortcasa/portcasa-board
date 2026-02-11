import os
import base64
import requests
import json
from datetime import datetime, timedelta

# Função simples para ler o .env sem precisar da biblioteca python-dotenv
def load_env():
    if os.path.exists('.env'):
        with open('.env', 'r') as f:
            for line in f:
                if line.strip() and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value

# Carrega as variáveis
load_env()

# Configurações do Supabase (Via REST API direta)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

def salvar_token_supabase(dados):
    """Envia os dados para o Supabase via HTTP Request direto"""
    endpoint = f"{SUPABASE_URL}/rest/v1/integracoes_bling"
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates" # Importante para o Upsert funcionar
    }
    
    # O parametro on_conflict informa qual coluna checar para saber se é update ou insert
    params = {"on_conflict": "nome_loja"}
    
    response = requests.post(endpoint, headers=headers, params=params, json=dados)
    
    if response.status_code in [200, 201, 204]:
        print("💾 Tokens salvos no Supabase com sucesso!")
    else:
        print(f"❌ Erro ao salvar no Supabase: {response.status_code}")
        print(response.text)

def gerar_token_inicial(nome_loja, code):
    # Pega as credenciais do ambiente
    client_id = os.environ.get(f"BLING_CLIENT_ID_{nome_loja}")
    client_secret = os.environ.get(f"BLING_SECRET_{nome_loja}")
    
    if not client_id or not client_secret:
        print(f"Erro: Credenciais não encontradas no .env para {nome_loja}")
        return

    # Prepara a autenticação para o Bling
    credenciais = f"{client_id}:{client_secret}"
    auth_header = base64.b64encode(credenciais.encode()).decode()

    print(f"🔄 Solicitando token para {nome_loja}...")

    # Chama a API do Bling
    try:
        response = requests.post(
            "https://www.bling.com.br/Api/v3/oauth/token",
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            data={
                "grant_type": "authorization_code",
                "code": code
            }
        )

        if response.status_code == 200:
            data = response.json()
            access_token = data.get('access_token')
            refresh_token = data.get('refresh_token')
            expires_in = data.get('expires_in', 21600)
            
            # Calcula a data de expiração
            expires_at = datetime.now() + timedelta(seconds=expires_in)
            
            print("✅ Tokens recebidos do Bling!")
            
            # Prepara dados para o Supabase
            dados_upsert = {
                "nome_loja": nome_loja,
                "client_id": client_id,
                "client_secret": client_secret,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_at": expires_at.isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            
            # Salva
            salvar_token_supabase(dados_upsert)
            
        else:
            print("❌ Erro ao gerar token no Bling:")
            print(response.text)
            
    except Exception as e:
        print(f"Erro de conexão: {e}")

# --- EXECUÇÃO ---
# 1. Gere o CODE no navegador para a loja específica.
# 2. Descomente a linha abaixo correspondente e cole o code.

# gerar_token_inicial("PORTCASA", "53752cdb5abbf0518eb248f4a8f7dcb4a3eb4e5a")
# gerar_token_inicial("PORTFIO", "31571308f344689c91ce4c98de786ab900a60399")
# gerar_token_inicial("CASA_MODELO", "f4f5c5d956dda7020bf2813c2442330e24e151e4")